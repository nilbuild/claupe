import { parseSessionOnlyArgs } from "../args.js";

export async function runReset(argv: string[]): Promise<void> {
  const options = parseSessionOnlyArgs(argv);
  throw new Error(`reset not implemented yet (session=${options.session})`);
}
