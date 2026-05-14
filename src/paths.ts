import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const STATE_DIR = process.env.CLAUPE_STATE_DIR
  ?? join(homedir(), ".config", "claupe");

export const SESSIONS_FILE = join(STATE_DIR, "sessions.json");

const FIFO_DIR = process.env.CLAUPE_FIFO_DIR ?? tmpdir();

export function fifoPath(id: string): string {
  return join(FIFO_DIR, `claupe-${id}.fifo`);
}
