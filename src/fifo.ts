import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

export function createFifo(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
  const result = spawnSync("mkfifo", ["-m", "0600", path]);
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() ?? "";
    throw new Error(`mkfifo failed${stderr ? `: ${stderr}` : ""}`);
  }
}

export function destroyFifo(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // best-effort cleanup
  }
}
