import { SessionStore } from "../store.js";

export async function runStatus(_argv: string[]): Promise<void> {
  const store = new SessionStore();
  const names = await store.listSessions();
  if (names.length === 0) {
    process.stdout.write("no stored sessions\n");
    return;
  }
  for (const name of names) {
    const resume = await store.getResumeId(name);
    process.stdout.write(`${name}\tresume=${resume ?? "(none)"}\n`);
  }
}
