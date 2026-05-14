export async function runDaemon(argv: string[]): Promise<void> {
  const sub = argv[0];
  if (sub !== "run") {
    throw new Error(`usage: claupe daemon run`);
  }
  throw new Error("daemon not implemented yet");
}
