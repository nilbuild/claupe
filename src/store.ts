import fs from "node:fs/promises";
import { dirname } from "node:path";
import { SESSIONS_FILE } from "./paths.js";

interface SessionRecord {
  resumeId: string | null;
}

interface SessionFile {
  version: 1;
  sessions: Record<string, SessionRecord>;
}

const EMPTY: SessionFile = { version: 1, sessions: {} };

export class SessionStore {
  private cache: SessionFile = EMPTY;
  private loaded = false;

  async load(): Promise<void> {
    try {
      const text = await fs.readFile(SESSIONS_FILE, "utf8");
      const parsed = JSON.parse(text) as SessionFile;
      if (parsed && typeof parsed === "object" && parsed.version === 1) {
        this.cache = parsed;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      this.cache = { version: 1, sessions: {} };
    }
    this.loaded = true;
  }

  getResumeId(name: string): string | null {
    this.ensureLoaded();
    return this.cache.sessions[name]?.resumeId ?? null;
  }

  listSessions(): string[] {
    this.ensureLoaded();
    return Object.keys(this.cache.sessions).sort();
  }

  async setResumeId(name: string, resumeId: string | null): Promise<void> {
    this.ensureLoaded();
    const existing = this.cache.sessions[name]?.resumeId ?? null;
    if (existing === resumeId) {
      return;
    }
    this.cache.sessions[name] = { resumeId };
    await this.persist();
  }

  async forget(name: string): Promise<void> {
    this.ensureLoaded();
    if (!(name in this.cache.sessions)) {
      return;
    }
    delete this.cache.sessions[name];
    await this.persist();
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("SessionStore.load() must be called before use");
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(dirname(SESSIONS_FILE), { recursive: true });
    const text = `${JSON.stringify(this.cache, null, 2)}\n`;
    await fs.writeFile(SESSIONS_FILE, text);
  }
}
