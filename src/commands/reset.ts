import { parseSessionOnlyArgs } from "../args.js";
import { connectToDaemon, readMessages, send } from "../client.js";
import type { ServerMessage } from "../protocol.js";

export async function runReset(argv: string[]): Promise<void> {
  const options = parseSessionOnlyArgs(argv);
  const socket = await connectToDaemon({ autostart: false });
  send(socket, { type: "reset", session: options.session });

  for await (const message of readMessages<ServerMessage>(socket)) {
    if (message.type === "reset-ok") {
      process.stdout.write(`reset ${message.session}\n`);
      return;
    }
    if (message.type === "error") {
      throw new Error(message.message);
    }
  }
}
