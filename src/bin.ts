#!/usr/bin/env node
import { main } from "./cli.js";

main(process.argv.slice(2)).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`claupe: ${message}\n`);
  process.exit(1);
});
