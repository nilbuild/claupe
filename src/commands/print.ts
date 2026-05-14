import { parsePrintArgs } from "../args.js";
import { connectToDaemon, readMessages, send } from "../client.js";
import type { OutputFormat } from "../args.js";
import type { ServerMessage } from "../protocol.js";

interface FormatterState {
  buffer: string[];
  requestId: string | null;
}

export async function runPrint(argv: string[]): Promise<void> {
  const options = await parsePrintArgs(argv);
  const socket = await connectToDaemon({ autostart: true });

  send(socket, {
    type: "enqueue",
    session: options.session,
    resume: options.resume,
    prompt: options.prompt,
    format: options.outputFormat,
    noWait: options.noWait,
  });

  const state: FormatterState = { buffer: [], requestId: null };

  for await (const message of readMessages<ServerMessage>(socket)) {
    if (message.type === "accepted") {
      state.requestId = message.id;
      if (options.noWait) {
        process.stdout.write(`${message.id}\n`);
        return;
      }
      continue;
    }

    if (message.type === "chunk") {
      handleChunk(message.data, options.outputFormat, state);
      continue;
    }

    if (message.type === "done") {
      handleDone(options.outputFormat, state);
      return;
    }

    if (message.type === "error") {
      throw new Error(message.message);
    }
  }

  if (!options.noWait) {
    throw new Error("connection closed before response completed");
  }
}

function handleChunk(data: string, format: OutputFormat, state: FormatterState): void {
  if (format === "text") {
    process.stdout.write(data);
    return;
  }
  if (format === "stream-json") {
    process.stdout.write(`${JSON.stringify({ type: "chunk", data })}\n`);
    state.buffer.push(data);
    return;
  }
  state.buffer.push(data);
}

function handleDone(format: OutputFormat, state: FormatterState): void {
  if (format === "text") {
    if (!state.buffer.length) {
      // ensure trailing newline if Claude didn't send one
    }
    return;
  }
  const result = state.buffer.join("");
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ type: "result", request_id: state.requestId, result })}\n`);
    return;
  }
  if (format === "stream-json") {
    process.stdout.write(`${JSON.stringify({ type: "result", request_id: state.requestId, result })}\n`);
    return;
  }
}
