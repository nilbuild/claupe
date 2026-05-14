import { runPrint } from "./commands/print.js";
import { runDaemon } from "./commands/daemon.js";
import { runAgent } from "./commands/agent.js";
import { runStatus } from "./commands/status.js";
import { runReset } from "./commands/reset.js";

const VERSION = "0.0.1";

export async function main(argv: string[]): Promise<void> {
  if (argv.length === 0) {
    printHelp();
    return;
  }

  const first = argv[0]!;

  if (first === "--help" || first === "-h") {
    printHelp();
    return;
  }

  if (first === "--version" || first === "-v") {
    process.stdout.write(`claupe ${VERSION}\n`);
    return;
  }

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

  if (first === "-p" || first === "--print") {
    await runPrint(argv.slice(1));
    return;
  }

  throw new Error(`unknown command: ${first}`);
}

function printHelp(): void {
  process.stdout.write(
    [
      "claupe — a persistent-TUI shim for claude -p",
      "",
      "Usage:",
      "  claupe -p [flags] <prompt>          Send a prompt and wait for the answer",
      "  claupe daemon run                   Run the local daemon in the foreground",
      "  claupe agent <request-id>           Internal: stream stdin back to the daemon",
      "  claupe status                       Show daemon and session state",
      "  claupe reset [--session <name>]     Reset a named session",
      "",
      "Flags for -p:",
      "  --session <name>                    Route request to a named session (default: \"default\")",
      "  --resume, -r <id>                   Resume a Claude conversation by id",
      "  --output-format <text|json|stream-json>",
      "  --no-wait                           Enqueue and print the request id",
      "",
    ].join("\n"),
  );
}
