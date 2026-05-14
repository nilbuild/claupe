import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { parsePrintArgs, type OutputFormat } from "../args.js";
import { buildEnvelope } from "../envelope.js";
import { createFifo, destroyFifo } from "../fifo.js";
import { STATE_DIR, fifoPath } from "../paths.js";
import { SessionStore } from "../store.js";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

const READY_IDLE_MS = Number(process.env.CLAUPE_READY_IDLE_MS ?? "500");
const READY_MAX_WAIT_MS = Number(process.env.CLAUPE_READY_MAX_WAIT_MS ?? "15000");
const REQUEST_TIMEOUT_MS = Number(process.env.CLAUPE_TIMEOUT_MS ?? "300000");

interface RunContext {
  format: OutputFormat;
  buffer: string[];
  requestId: string;
}

export async function runPrint(argv: string[]): Promise<void> {
  const options = await parsePrintArgs(argv);
  await mkdir(STATE_DIR, { recursive: true });

  const store = new SessionStore();
  const resumeId = options.resume ?? (await store.getResumeId(options.session));
  if (options.resume) {
    await store.setResumeId(options.session, options.resume);
  }

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

  const cleanup = () => {
    if (claude && !killed) {
      killed = true;
      try {
        claude.kill();
      } catch {
        // already gone
      }
    }
    destroyFifo(fifo);
  };

  const onSigint = () => {
    cleanup();
    process.exit(130);
  };
  const onSigterm = () => {
    cleanup();
    process.exit(143);
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    const claudeBinary = process.env.CLAUPE_CLAUDE_BIN ?? "claude";
    const claudeArgs = ["--dangerously-skip-permissions"];
    if (resumeId) {
      claudeArgs.push("--resume", resumeId);
    }

    claude = pty.spawn(claudeBinary, claudeArgs, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
      env: { ...process.env },
    });

    const fifoDone = readFifo(fifo, ctx);

    const exitedEarly = new Promise<never>((_, reject) => {
      claude!.onExit(({ exitCode, signal }) => {
        if (!killed) {
          reject(new Error(`claude exited before responding (code=${exitCode}, signal=${signal ?? "none"})`));
        }
      });
    });

    await waitForReady(claude, READY_IDLE_MS, READY_MAX_WAIT_MS);

    const envelope = buildEnvelope({ id, prompt: options.prompt });
    claude.write(PASTE_START);
    claude.write(envelope);
    claude.write(PASTE_END);
    claude.write("\r");

    await raceWithTimeout(
      Promise.race([fifoDone, exitedEarly]),
      REQUEST_TIMEOUT_MS,
      () => new Error(`timed out after ${REQUEST_TIMEOUT_MS}ms waiting for claude to respond`),
    );

    finalize(ctx);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    cleanup();
  }
}

async function waitForReady(claude: pty.IPty, idleMs: number, maxWaitMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let idleTimer = setTimeout(finish, idleMs);
    const maxTimer = setTimeout(
      () => fail(new Error(`claude did not become idle within ${maxWaitMs}ms`)),
      maxWaitMs,
    );
    const sub = claude.onData(() => {
      if (settled) {
        return;
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, idleMs);
    });
    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(maxTimer);
      sub.dispose();
      resolve();
    }
    function fail(err: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(idleTimer);
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
