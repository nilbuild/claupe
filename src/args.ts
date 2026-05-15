export type OutputFormat = "text" | "json" | "stream-json";

export interface PrintOptions {
  prompt: string;
  outputFormat: OutputFormat;
}

const FLAGS_WITH_VALUE = new Set(["--output-format"]);

const KNOWN_BOOLEAN_FLAGS = new Set(["-p", "--print"]);

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string>;
  booleans: Set<string>;
}

function parseRawArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  const booleans = new Set<string>();

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) {
      break;
    }

    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("--") && arg.includes("=")) {
      const eq = arg.indexOf("=");
      const name = arg.slice(0, eq);
      const value = arg.slice(eq + 1);
      flags.set(name, value);
      i++;
      continue;
    }

    if (FLAGS_WITH_VALUE.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`flag ${arg} requires a value`);
      }
      flags.set(arg, value);
      i += 2;
      continue;
    }

    if (KNOWN_BOOLEAN_FLAGS.has(arg)) {
      booleans.add(arg);
      i++;
      continue;
    }

    if (arg.startsWith("-") && arg !== "-") {
      throw new Error(`unknown flag: ${arg}`);
    }

    positional.push(arg);
    i++;
  }

  return { positional, flags, booleans };
}

function parseOutputFormat(raw: string | undefined): OutputFormat {
  if (raw === undefined) {
    return "text";
  }
  if (raw === "text" || raw === "json" || raw === "stream-json") {
    return raw;
  }
  throw new Error(`unsupported --output-format: ${raw}`);
}

export async function parsePrintArgs(argv: string[]): Promise<PrintOptions> {
  const parsed = parseRawArgs(argv);
  const promptParts = [...parsed.positional];
  const stdinText = await readStdinIfPiped();
  if (stdinText !== null) {
    if (promptParts.length > 0) {
      promptParts.push("");
    }
    promptParts.push(stdinText);
  }

  const prompt = promptParts.join("\n").trim();
  if (prompt.length === 0) {
    throw new Error("no prompt provided (positional args or piped stdin)");
  }

  const outputFormat = parseOutputFormat(parsed.flags.get("--output-format"));

  return { prompt, outputFormat };
}

async function readStdinIfPiped(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return null;
  }
  return Buffer.concat(chunks).toString("utf8");
}
