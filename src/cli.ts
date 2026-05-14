import { runPrint } from "./commands/print.js";
import { runDaemon } from "./commands/daemon.js";
import { runAgent } from "./commands/agent.js";
import { runStatus } from "./commands/status.js";
import { runReset } from "./commands/reset.js";

const VERSION = "0.0.1";

const SUBCOMMANDS = new Set(["daemon", "agent", "status", "reset"]);

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

  if (first !== undefined && SUBCOMMANDS.has(first)) {
    if (first === "daemon") {
      await runDaemon(argv.slice(1));
      return;
    }
    if (first === "agent") {
      await runAgent(argv.slice(1));
      return;
    }
    if (first === "status") {
      await runStatus(argv.slice(1));
      return;
    }
    if (first === "reset") {
      await runReset(argv.slice(1));
      return;
    }
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
      "claupe — a persistent-TUI shim for claude -p",
      "",
      "Usage:",
      "  claupe [flags] <prompt>             Send a prompt and wait for the answer",
      "  claupe daemon run                   Run the local daemon in the foreground",
      "  claupe agent <request-id>           Internal: stream stdin back to the daemon",
      "  claupe status                       Show daemon and session state",
      "  claupe reset [--session <name>]     Reset a named session",
      "",
      "Flags for prompts:",
      "  -p, --print                         Accepted for claude -p compatibility (no-op)",
      "  --session <name>                    Route request to a named session (default: \"default\")",
      "  --resume, -r <id>                   Resume a Claude conversation by id",
      "  --output-format <text|json|stream-json>",
      "  --no-wait                           Enqueue and print the request id",
      "",
      "stdin is appended to the prompt when piped.",
      "",
    ].join("\n"),
  );
}
