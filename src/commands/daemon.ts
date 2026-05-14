import { runDaemonServer } from "../daemon/server.js";

export async function runDaemon(argv: string[]): Promise<void> {
  const sub = argv[0];
  if (sub !== "run") {
    throw new Error("usage: claupe daemon run");
  }
  await runDaemonServer();
}
