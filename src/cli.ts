import { runAgent } from "./commands/agent.js";
import { runPrint } from "./commands/print.js";

const VERSION = "0.0.1";

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

  if (first === "agent") {
    await runAgent(argv.slice(1));
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
      "",
      "Flags for prompts:",
      "  -p, --print                         Accepted for claude -p compatibility (no-op)",
      "  --output-format <text|json|stream-json>",
      "",
      "stdin is appended to the prompt when piped.",
      "",
    ].join("\n"),
  );
}
