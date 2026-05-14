export async function main(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return;
  }

  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write("claupe 0.0.1\n");
    return;
  }

  throw new Error(`unknown command: ${argv[0]}`);
}

function printHelp(): void {
  process.stdout.write(
    [
      "claupe — a persistent-TUI shim for claude -p",
      "",
      "Usage:",
      "  claupe -p <prompt>            Send a prompt and wait for the answer",
      "  claupe daemon run             Run the local daemon in the foreground",
      "  claupe agent <request-id>     Internal: stream stdin back to the daemon",
      "  claupe status                 Show daemon and session state",
      "  claupe reset --session <name> Reset a named session",
      "",
    ].join("\n"),
  );
}
