export async function runAgent(argv: string[]): Promise<void> {
  const id = argv[0];
  if (id === undefined || id.startsWith("-")) {
    throw new Error("usage: claupe agent <request-id>");
  }
  throw new Error(`agent not implemented yet (id=${id})`);
}
