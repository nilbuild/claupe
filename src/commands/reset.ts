import { parseSessionOnlyArgs } from "../args.js";
import { SessionStore } from "../store.js";

export async function runReset(argv: string[]): Promise<void> {
  const options = parseSessionOnlyArgs(argv);
  const store = new SessionStore();
  await store.load();
  await store.forget(options.session);
  process.stdout.write(`reset ${options.session}\n`);
}
