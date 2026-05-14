import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { parsePrintArgs, type OutputFormat } from "../args.js";
import { buildEnvelope } from "../envelope.js";
import { createFifo, destroyFifo } from "../fifo.js";
import { STATE_DIR, fifoPath } from "../paths.js";
import { SessionStore } from "../store.js";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

interface RunContext {
  format: OutputFormat;
  buffer: string[];
  requestId: string;
}

export async function runPrint(argv: string[]): Promise<void> {
  const options = await parsePrintArgs(argv);
  await mkdir(STATE_DIR, { recursive: true });

  const store = new SessionStore();
  await store.load();

  const resumeId = options.resume ?? store.getResumeId(options.session);
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

    const bootDelay = Number(process.env.CLAUPE_BOOT_DELAY_MS ?? "3000");
    await sleep(bootDelay);

    const envelope = buildEnvelope({ id, prompt: options.prompt });
    claude.write(PASTE_START);
    claude.write(envelope);
    claude.write(PASTE_END);
    claude.write("\r");

    await Promise.race([fifoDone, exitedEarly]);

    finalize(ctx);
  } finally {
    if (claude) {
      killed = true;
      try {
        claude.kill();
      } catch {
        // already gone
      }
    }
    destroyFifo(fifo);
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
