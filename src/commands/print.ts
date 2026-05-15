import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { type OutputFormat, parsePrintArgs } from "../args.js";
import { buildEnvelope } from "../envelope.js";
import { createFifo, destroyFifo } from "../fifo.js";
import { fifoPath } from "../paths.js";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

const READY_IDLE_MS = Number(process.env.CLAUPE_READY_IDLE_MS ?? "800");
const READY_MAX_WAIT_MS = Number(process.env.CLAUPE_READY_MAX_WAIT_MS ?? "30000");
const REQUEST_TIMEOUT_MS = Number(process.env.CLAUPE_TIMEOUT_MS ?? "300000");
const FIXED_BOOT_DELAY_MS = Number(process.env.CLAUPE_BOOT_DELAY_MS ?? "0");

interface RunContext {
  format: OutputFormat;
  buffer: string[];
  requestId: string;
}

export async function runPrint(argv: string[]): Promise<void> {
  const options = await parsePrintArgs(argv);

  const id = `req-${randomUUID()}`;
  const fifo = fifoPath(id);
  createFifo(fifo);

  const ctx: RunContext = {
    format: options.outputFormat,
    buffer: [],
    requestId: id,
  };

  let claude: pty.IPty | null = null;
  let killed = false;
  let interrupting = false;

  const cleanup = () => {
    if (claude && !killed) {
      killed = true;
      try {
        claude.kill("SIGKILL");
      } catch {}
    }
    destroyFifo(fifo);
  };

  const onInterrupt = (signal: NodeJS.Signals) => {
    if (interrupting) {
      process.kill(process.pid, "SIGKILL");
      return;
    }
    interrupting = true;
    cleanup();
    process.stderr.write(`\nclaupe: interrupted (${signal})\n`);
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    // libuv can stall on pending pty/fifo fds, so don't trust process.exit.
    process.kill(process.pid, "SIGKILL");
  };

  process.on("SIGINT", () => onInterrupt("SIGINT"));
  process.on("SIGTERM", () => onInterrupt("SIGTERM"));

  try {
    const claudeBinary = process.env.CLAUPE_CLAUDE_BIN ?? "claude";
    const claudeArgs = ["--dangerously-skip-permissions"];

    const proc = pty.spawn(claudeBinary, claudeArgs, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
      env: { ...process.env },
    });
    claude = proc;

    const fifoDone = readFifo(fifo, ctx);

    const exitedEarly = new Promise<never>((_, reject) => {
      proc.onExit(({ exitCode, signal }) => {
        if (!killed) {
          reject(
            new Error(
              `claude exited before responding (code=${exitCode}, signal=${signal ?? "none"})`,
            ),
          );
        }
      });
    });

    if (FIXED_BOOT_DELAY_MS > 0) {
      await sleep(FIXED_BOOT_DELAY_MS);
    } else {
      await Promise.race([waitForReady(proc, READY_IDLE_MS, READY_MAX_WAIT_MS), exitedEarly]);
    }

    const envelope = buildEnvelope({ id, prompt: options.prompt });
    proc.write(PASTE_START);
    proc.write(envelope);
    proc.write(PASTE_END);
    proc.write("\r");

    await raceWithTimeout(
      Promise.race([fifoDone, exitedEarly]),
      REQUEST_TIMEOUT_MS,
      () => new Error(`timed out after ${REQUEST_TIMEOUT_MS}ms waiting for claude to respond`),
    );

    finalize(ctx);
  } finally {
    cleanup();
  }
}

async function waitForReady(claude: pty.IPty, idleMs: number, maxWaitMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let idleTimer: NodeJS.Timeout | null = null;
    const maxTimer = setTimeout(
      () =>
        fail(
          new Error(`claude did not become idle within ${maxWaitMs}ms (no output or never paused)`),
        ),
      maxWaitMs,
    );
    const sub = claude.onData(() => {
      if (settled) {
        return;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(finish, idleMs);
    });
    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      clearTimeout(maxTimer);
      sub.dispose();
      resolve();
    }
    function fail(err: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      clearTimeout(maxTimer);
      sub.dispose();
      reject(err);
    }
  });
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  buildError: () => Error,
): Promise<T> {
  let handle: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(buildError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) {
      clearTimeout(handle);
    }
  }
}

async function readFifo(path: string, ctx: RunContext): Promise<void> {
  const handle = await open(path, "r");
  const stream = handle.createReadStream({ encoding: "utf8" });
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      handleChunk(data, ctx);
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
}

function handleChunk(data: string, ctx: RunContext): void {
  if (ctx.format === "text") {
    process.stdout.write(data);
    return;
  }
  ctx.buffer.push(data);
  if (ctx.format === "stream-json") {
    process.stdout.write(`${JSON.stringify({ type: "chunk", data })}\n`);
  }
}

function finalize(ctx: RunContext): void {
  if (ctx.format === "text") {
    return;
  }
  const result = ctx.buffer.join("");
  process.stdout.write(
    `${JSON.stringify({ type: "result", request_id: ctx.requestId, result })}\n`,
  );
}
