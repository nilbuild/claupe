import { createWriteStream, existsSync } from "node:fs";
import { fifoPath } from "../paths.js";

export async function runAgent(argv: string[]): Promise<void> {
  const id = argv[0];
  if (id === undefined || id.startsWith("-")) {
    throw new Error("usage: claupe agent <request-id>");
  }

  const fifo = fifoPath(id);
  if (!existsSync(fifo)) {
    throw new Error(`no pending request for id ${id} (fifo missing: ${fifo})`);
  }

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(fifo);
    out.on("error", reject);
    out.on("finish", resolve);
    process.stdin.on("error", reject);
    process.stdin.pipe(out);
  });
}
