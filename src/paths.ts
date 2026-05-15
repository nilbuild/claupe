import { tmpdir } from "node:os";
import { join } from "node:path";

const FIFO_DIR = process.env.CLAUPE_FIFO_DIR ?? tmpdir();

export function fifoPath(id: string): string {
  return join(FIFO_DIR, `claupe-${id}.fifo`);
}
