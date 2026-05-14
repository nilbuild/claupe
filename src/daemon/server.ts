import net from "node:net";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { appendFileSync } from "node:fs";
import type { Socket } from "node:net";
import { SOCKET_PATH, STATE_DIR, DAEMON_LOG } from "../paths.js";
import {
  LineReader,
  parseMessage,
  writeMessage,
  type ClientMessage,
} from "../protocol.js";
import { RequestRegistry } from "./requests.js";
import { SessionRegistry } from "./sessions.js";

interface ConnState {
  reader: LineReader;
  role: "unknown" | "print" | "agent" | "control";
  agentId: string | null;
}

export async function runDaemonServer(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });

  if (existsSync(SOCKET_PATH)) {
    const stillAlive = await isSocketAlive(SOCKET_PATH);
    if (stillAlive) {
      throw new Error(`daemon already running (socket: ${SOCKET_PATH})`);
    }
    await fs.unlink(SOCKET_PATH).catch(() => {});
  }

  const requests = new RequestRegistry();
  const sessions = new SessionRegistry(requests, {
    claudeBinary: process.env.CLAUPE_CLAUDE_BIN ?? "claude",
    bootDelayMs: Number(process.env.CLAUPE_BOOT_DELAY_MS ?? "3000"),
    extraClaudeArgs: ["--dangerously-skip-permissions"],
  });

  const server = net.createServer((socket) => {
    handleConnection(socket, requests, sessions);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(SOCKET_PATH, () => {
      server.off("error", reject);
      resolve();
    });
  });

  log(`claupe daemon listening on ${SOCKET_PATH}`);

  const shutdown = async () => {
    log("daemon shutting down");
    server.close();
    await sessions.shutdown();
    await fs.unlink(SOCKET_PATH).catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise<void>(() => {});
}

function handleConnection(
  socket: Socket,
  requests: RequestRegistry,
  sessions: SessionRegistry,
): void {
  const state: ConnState = {
    reader: new LineReader(),
    role: "unknown",
    agentId: null,
  };

  socket.on("data", (chunk) => {
    let lines: string[];
    try {
      lines = state.reader.push(chunk);
    } catch (err) {
      writeMessage(socket, { type: "error", message: errorMessage(err) });
      socket.end();
      return;
    }
    for (const line of lines) {
      try {
        const msg = parseMessage<ClientMessage>(line);
        handleMessage(msg, socket, state, requests, sessions);
      } catch (err) {
        writeMessage(socket, { type: "error", message: errorMessage(err) });
        socket.end();
        return;
      }
    }
  });

  socket.on("close", () => {
    if (state.role === "agent" && state.agentId) {
      const request = requests.get(state.agentId);
      if (request?.client && !request.client.destroyed) {
        writeMessage(request.client, { type: "done" });
        request.client.end();
      }
      sessions.finalizeCurrent(request?.session ?? "");
    }
    if (state.role === "print") {
      // Print client disconnected before completion; detach so agent bytes are dropped.
      for (const id of [] as string[]) {
        requests.detachClient(id);
      }
    }
  });

  socket.on("error", () => {
    // swallow; close handler does cleanup
  });
}

function handleMessage(
  msg: ClientMessage,
  socket: Socket,
  state: ConnState,
  requests: RequestRegistry,
  sessions: SessionRegistry,
): void {
  if (msg.type === "enqueue") {
    if (state.role !== "unknown") {
      throw new Error("connection already has a role");
    }
    state.role = "print";
    const request = requests.create({
      session: msg.session,
      prompt: msg.prompt,
      resume: msg.resume,
      noWait: msg.noWait,
      client: msg.noWait ? null : socket,
    });
    writeMessage(socket, { type: "accepted", id: request.id });
    void sessions.enqueue(request);
    if (msg.noWait) {
      socket.end();
    }
    return;
  }

  if (msg.type === "agent-open") {
    if (state.role !== "unknown") {
      throw new Error("connection already has a role");
    }
    const request = requests.get(msg.id);
    if (!request) {
      throw new Error(`unknown request id: ${msg.id}`);
    }
    state.role = "agent";
    state.agentId = msg.id;
    return;
  }

  if (msg.type === "agent-chunk") {
    if (state.role !== "agent" || state.agentId === null) {
      throw new Error("agent-chunk before agent-open");
    }
    const request = requests.get(state.agentId);
    if (request?.client && !request.client.destroyed) {
      writeMessage(request.client, { type: "chunk", data: msg.data });
    }
    return;
  }

  if (msg.type === "agent-done") {
    if (state.role !== "agent" || state.agentId === null) {
      throw new Error("agent-done before agent-open");
    }
    socket.end();
    return;
  }

  if (msg.type === "status") {
    state.role = "control";
    writeMessage(socket, {
      type: "status-result",
      sessions: sessions.summaries(),
    });
    socket.end();
    return;
  }

  if (msg.type === "reset") {
    state.role = "control";
    void sessions.kill(msg.session).then(() => {
      writeMessage(socket, { type: "reset-ok", session: msg.session });
      socket.end();
    });
    return;
  }

  throw new Error(`unhandled message type: ${(msg as { type: string }).type}`);
}

async function isSocketAlive(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createConnection(path);
    probe.once("connect", () => {
      probe.end();
      resolve(true);
    });
    probe.once("error", () => {
      resolve(false);
    });
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function log(line: string): void {
  const stamp = new Date().toISOString();
  const text = `[${stamp}] ${line}\n`;
  process.stderr.write(text);
  try {
    appendFileSync(DAEMON_LOG, text);
  } catch {
    // logging is best-effort
  }
}
