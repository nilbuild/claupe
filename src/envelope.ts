export function buildEnvelope(opts: { id: string; prompt: string }): string {
  const callback = `claupe agent ${opts.id}`;
  return [
    `[claupe request ${opts.id}]`,
    "",
    "When you have completed the user's request below, pipe ONLY the final",
    "answer text to the following command. Do not include preamble, thinking,",
    "or tool output — just the answer text itself. Run it exactly once.",
    "",
    "  printf '%s' \"<your final answer>\" | " + callback,
    "",
    "If the answer is long, you may stream it line by line, but use the same",
    "command; claupe will reassemble the bytes in order.",
    "",
    "User request:",
    "",
    opts.prompt,
  ].join("\n");
}
