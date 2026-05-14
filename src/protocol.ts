import type { Socket } from "node:net";
import type { OutputFormat } from "./args.js";

export interface EnqueueMessage {
  type: "enqueue";
  session: string;
  resume: string | null;
  prompt: string;
  format: OutputFormat;
  noWait: boolean;
}

export interface AgentOpenMessage {
  type: "agent-open";
  id: string;
}

export interface AgentChunkMessage {
  type: "agent-chunk";
  data: string;
}

export interface AgentDoneMessage {
  type: "agent-done";
}

export interface StatusRequestMessage {
  type: "status";
}

export interface ResetRequestMessage {
  type: "reset";
  session: string;
}

export type ClientMessage =
  | EnqueueMessage
  | AgentOpenMessage
  | AgentChunkMessage
  | AgentDoneMessage
  | StatusRequestMessage
  | ResetRequestMessage;

export interface AcceptedMessage {
  type: "accepted";
  id: string;
}

export interface ChunkMessage {
  type: "chunk";
  data: string;
}

export interface DoneMessage {
  type: "done";
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface SessionSummary {
  name: string;
  alive: boolean;
  resumeId: string | null;
  pendingRequests: number;
}

export interface StatusResultMessage {
  type: "status-result";
  sessions: SessionSummary[];
}

export interface ResetOkMessage {
  type: "reset-ok";
  session: string;
}

export type ServerMessage =
  | AcceptedMessage
  | ChunkMessage
  | DoneMessage
  | ErrorMessage
  | StatusResultMessage
  | ResetOkMessage;

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function writeMessage(
  socket: Socket,
  message: ClientMessage | ServerMessage,
): void {
  socket.write(encodeMessage(message));
}

export class LineReader {
  private buffer = "";

  push(chunk: Buffer | string): string[] {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const lines: string[] = [];
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length > 0) {
        lines.push(line);
      }
      newline = this.buffer.indexOf("\n");
    }
    return lines;
  }

  flush(): string | null {
    if (this.buffer.length === 0) {
      return null;
    }
    const remaining = this.buffer;
    this.buffer = "";
    return remaining;
  }
}

export function parseMessage<T>(line: string): T {
  const parsed = JSON.parse(line);
  if (parsed === null || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new Error("invalid message: missing type");
  }
  return parsed as T;
}
