import { connectToDaemon, send } from "../client.js";

export async function runAgent(argv: string[]): Promise<void> {
  const id = argv[0];
  if (id === undefined || id.startsWith("-")) {
    throw new Error("usage: claupe agent <request-id>");
  }

  const socket = await connectToDaemon({ autostart: false });
  send(socket, { type: "agent-open", id });

  const flushChunk = (text: string) => {
    if (text.length === 0) {
      return;
    }
    send(socket, { type: "agent-chunk", data: text });
  };

  await new Promise<void>((resolve, reject) => {
    process.stdin.on("data", (chunk) => {
      flushChunk(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    process.stdin.on("end", () => {
      send(socket, { type: "agent-done" });
      socket.end();
      resolve();
    });
    process.stdin.on("error", reject);
    socket.on("error", reject);
  });
}
