import * as pty from "node-pty";
import { buildEnvelope } from "./envelope.js";
import type { PrintRequest, RequestRegistry } from "./requests.js";

export interface SessionOptions {
  claudeBinary: string;
  bootDelayMs: number;
  extraClaudeArgs: string[];
}

interface ActiveSession {
  name: string;
  pty: pty.IPty;
  resumeId: string | null;
  ready: Promise<void>;
  queue: PrintRequest[];
  current: PrintRequest | null;
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

export class SessionRegistry {
  private sessions = new Map<string, ActiveSession>();

  constructor(
    private requests: RequestRegistry,
    private options: SessionOptions,
  ) {}

  async enqueue(request: PrintRequest): Promise<void> {
    const existing = this.sessions.get(request.session);

    if (existing && request.resume && existing.resumeId !== request.resume) {
      await this.kill(request.session);
    }

    let session = this.sessions.get(request.session);
    if (!session) {
      session = this.spawn(request.session, request.resume);
    }

    session.queue.push(request);
    void this.drain(session);
  }

  async kill(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (!session) {
      return;
    }
    session.pty.kill();
    this.sessions.delete(name);
    for (const pending of session.queue) {
      this.requests.failAndClose(pending.id, "session reset before completion");
    }
    if (session.current) {
      this.requests.failAndClose(session.current.id, "session reset before completion");
    }
  }

  summaries(): Array<{ name: string; alive: boolean; resumeId: string | null; pendingRequests: number }> {
    const result = [];
    for (const session of this.sessions.values()) {
      const pending = session.queue.length + (session.current ? 1 : 0);
      result.push({
        name: session.name,
        alive: true,
        resumeId: session.resumeId,
        pendingRequests: pending,
      });
    }
    return result;
  }

  async shutdown(): Promise<void> {
    for (const name of [...this.sessions.keys()]) {
      await this.kill(name);
    }
  }

  finalizeCurrent(name: string): void {
    const session = this.sessions.get(name);
    if (!session) {
      return;
    }
    if (session.current) {
      this.requests.delete(session.current.id);
      session.current = null;
    }
    void this.drain(session);
  }

  private spawn(name: string, resumeId: string | null): ActiveSession {
    const args = [...this.options.extraClaudeArgs];
    if (resumeId) {
      args.push("--resume", resumeId);
    }

    const proc = pty.spawn(this.options.claudeBinary, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
      env: { ...process.env },
    });

    const bootDelay = this.options.bootDelayMs;
    const ready = new Promise<void>((resolve) => {
      setTimeout(resolve, bootDelay);
    });

    proc.onExit(() => {
      this.sessions.delete(name);
    });

    const session: ActiveSession = {
      name,
      pty: proc,
      resumeId,
      ready,
      queue: [],
      current: null,
    };
    this.sessions.set(name, session);
    return session;
  }

  private async drain(session: ActiveSession): Promise<void> {
    if (session.current) {
      return;
    }
    const next = session.queue.shift();
    if (!next) {
      return;
    }
    session.current = next;
    await session.ready;

    const envelope = buildEnvelope({ id: next.id, prompt: next.prompt });
    session.pty.write(PASTE_START);
    session.pty.write(envelope);
    session.pty.write(PASTE_END);
    session.pty.write("\r");
  }
}
