export function buildEnvelope(opts: { id: string; prompt: string }): string {
  const callback = `claupe agent ${opts.id}`;
  return [
    `[claupe request ${opts.id}]`,
    "",
    "When you are finished, run exactly one shell command whose stdout pipes",
    "your full final answer — no preamble, no thinking, no tool output, just",
    "the answer text — into:",
    "",
    `    ${callback}`,
    "",
    "Pick any producer (heredoc, echo, printf, cat from a file) that handles",
    "your answer's content cleanly. Run that command once. Do not print the",
    "answer to your TUI output instead of the pipeline — claupe only receives",
    "bytes from the pipeline.",
    "",
    opts.prompt,
  ].join("\n");
}
