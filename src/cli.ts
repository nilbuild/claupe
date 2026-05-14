import { runAgent } from "./commands/agent.js";
import { runPrint } from "./commands/print.js";
import { runReset } from "./commands/reset.js";
import { runStatus } from "./commands/status.js";

const VERSION = "0.0.1";

const SUBCOMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
  agent: runAgent,
  status: runStatus,
  reset: runReset,
};

export async function main(argv: string[]): Promise<void> {
  const first = argv[0];

  if (first === "--help" || first === "-h") {
    printHelp();
    return;
  }

  if (first === "--version" || first === "-v") {
    process.stdout.write(`claupe ${VERSION}\n`);
    return;
  }

  const handler = first !== undefined ? SUBCOMMANDS[first] : undefined;
  if (handler) {
    await handler(argv.slice(1));
    return;
  }

  const printArgs = first === "-p" || first === "--print" ? argv.slice(1) : argv;

  if (printArgs.length === 0 && process.stdin.isTTY) {
    printHelp();
    return;
  }

  await runPrint(printArgs);
}

function printHelp(): void {
  process.stdout.write(
    [
      "claupe — a per-invocation shim that drives a real claude TUI",
      "",
      "Usage:",
      "  claupe [flags] <prompt>             Send a prompt and wait for the answer",
      "  claupe agent <request-id>           Internal: stream stdin back to the parent",
      "  claupe status                       List stored sessions and their resume ids",
      "  claupe reset [--session <name>]     Forget the stored resume id for a session",
      "",
      "Flags for prompts:",
      "  -p, --print                         Accepted for claude -p compatibility (no-op)",
      '  --session <name>                    Persisted session name (default: "default")',
      "  --resume, -r <id>                   Resume a Claude conversation by id (sticky)",
      "  --output-format <text|json|stream-json>",
      "",
      "stdin is appended to the prompt when piped.",
      "",
    ].join("\n"),
  );
}
