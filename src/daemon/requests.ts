import type { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { writeMessage } from "../protocol.js";

export interface PrintRequest {
  id: string;
  session: string;
  prompt: string;
  resume: string | null;
  noWait: boolean;
  client: Socket | null;
}

export class RequestRegistry {
  private byId = new Map<string, PrintRequest>();

  create(opts: {
    session: string;
    prompt: string;
    resume: string | null;
    noWait: boolean;
    client: Socket | null;
  }): PrintRequest {
    const id = `req-${randomUUID()}`;
    const request: PrintRequest = {
      id,
      session: opts.session,
      prompt: opts.prompt,
      resume: opts.resume,
      noWait: opts.noWait,
      client: opts.client,
    };
    this.byId.set(id, request);
    return request;
  }

  get(id: string): PrintRequest | undefined {
    return this.byId.get(id);
  }

  detachClient(id: string): void {
    const request = this.byId.get(id);
    if (request) {
      request.client = null;
    }
  }

  delete(id: string): void {
    this.byId.delete(id);
  }

  failAndClose(id: string, message: string): void {
    const request = this.byId.get(id);
    if (request?.client && !request.client.destroyed) {
      writeMessage(request.client, { type: "error", message });
      request.client.end();
    }
    this.byId.delete(id);
  }
}
