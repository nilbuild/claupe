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

export class SessionStore {
  private cache: SessionFile | null = null;

  async getResumeId(name: string): Promise<string | null> {
    const data = await this.ensureLoaded();
    return data.sessions[name]?.resumeId ?? null;
  }

  async setResumeId(name: string, resumeId: string | null): Promise<void> {
    const data = await this.ensureLoaded();
    const existing = data.sessions[name]?.resumeId ?? null;
    if (existing === resumeId) {
      return;
    }
    data.sessions[name] = { resumeId };
    await this.persist();
  }

  async forget(name: string): Promise<void> {
    const data = await this.ensureLoaded();
    if (!(name in data.sessions)) {
      return;
    }
    delete data.sessions[name];
    await this.persist();
  }

  async listSessions(): Promise<string[]> {
    const data = await this.ensureLoaded();
    return Object.keys(data.sessions).sort();
  }

  private async ensureLoaded(): Promise<SessionFile> {
    if (this.cache) {
      return this.cache;
    }
    try {
      const text = await fs.readFile(SESSIONS_FILE, "utf8");
      const parsed = JSON.parse(text) as SessionFile;
      if (parsed && typeof parsed === "object" && parsed.version === 1) {
        this.cache = parsed;
        return parsed;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
    this.cache = { version: 1, sessions: {} };
    return this.cache;
  }

  private async persist(): Promise<void> {
    if (!this.cache) {
      return;
    }
    await fs.mkdir(dirname(SESSIONS_FILE), { recursive: true });
    const text = `${JSON.stringify(this.cache, null, 2)}\n`;
    await fs.writeFile(SESSIONS_FILE, text);
  }
}
