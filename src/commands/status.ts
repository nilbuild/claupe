import { connectToDaemon, readMessages, send } from "../client.js";
import type { ServerMessage } from "../protocol.js";

export async function runStatus(_argv: string[]): Promise<void> {
  const socket = await connectToDaemon({ autostart: false });
  send(socket, { type: "status" });

  for await (const message of readMessages<ServerMessage>(socket)) {
    if (message.type === "status-result") {
      if (message.sessions.length === 0) {
        process.stdout.write("no active sessions\n");
        return;
      }
      for (const session of message.sessions) {
        const resume = session.resumeId ? ` resume=${session.resumeId}` : "";
        process.stdout.write(
          `${session.name}\talive=${session.alive}\tpending=${session.pendingRequests}${resume}\n`,
        );
      }
      return;
    }
    if (message.type === "error") {
      throw new Error(message.message);
    }
  }
}
