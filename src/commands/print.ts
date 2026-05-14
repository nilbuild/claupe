import { parsePrintArgs } from "../args.js";

export async function runPrint(argv: string[]): Promise<void> {
  const options = await parsePrintArgs(argv);
  throw new Error(
    `print not implemented yet (session=${options.session}, format=${options.outputFormat})`,
  );
}
