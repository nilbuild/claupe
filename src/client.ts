import net from "node:net";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { SOCKET_PATH } from "./paths.js";
import { LineReader, parseMessage, writeMessage } from "./protocol.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";

export async function connectToDaemon(opts: { autostart: boolean }): Promise<net.Socket> {
  if (await trySocket()) {
    return netConnect();
  }
  if (!opts.autostart) {
    throw new Error(`daemon is not running (socket: ${SOCKET_PATH})`);
  }
  await spawnDaemon();
  return netConnect();
}

async function trySocket(): Promise<boolean> {
  if (!existsSync(SOCKET_PATH)) {
    return false;
  }
  return new Promise((resolve) => {
    const probe = net.createConnection(SOCKET_PATH);
    probe.once("connect", () => {
      probe.end();
      resolve(true);
    });
    probe.once("error", () => {
      resolve(false);
    });
  });
}

async function spawnDaemon(): Promise<void> {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error("cannot locate claupe bin to autostart daemon");
  }
  const child = spawn(process.execPath, [scriptPath, "daemon", "run"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(100);
    if (await trySocket()) {
      return;
    }
  }
  throw new Error("daemon failed to start within timeout");
}

function netConnect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

export function send(socket: net.Socket, message: ClientMessage): void {
  writeMessage(socket, message);
}

export async function* readMessages<T extends ServerMessage>(
  socket: net.Socket,
): AsyncGenerator<T> {
  const reader = new LineReader();
  const queue: T[] = [];
  let resolveNext: ((value: T | null) => void) | null = null;
  let ended = false;
  let error: Error | null = null;

  const pump = (value: T | null) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(value);
    } else if (value !== null) {
      queue.push(value);
    }
  };

  socket.on("data", (chunk) => {
    try {
      for (const line of reader.push(chunk)) {
        pump(parseMessage<T>(line));
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      socket.destroy();
    }
  });

  socket.on("close", () => {
    ended = true;
    pump(null);
  });

  socket.on("error", (err) => {
    error = err;
    ended = true;
    pump(null);
  });

  while (true) {
    if (error) {
      throw error;
    }
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (ended) {
      return;
    }
    const next = await new Promise<T | null>((resolve) => {
      resolveNext = resolve;
    });
    if (error) {
      throw error;
    }
    if (next === null) {
      return;
    }
    yield next;
  }
}
