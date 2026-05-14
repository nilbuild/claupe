# claupe

`claupe` is a small Node.js shim that lets scripts and cron jobs talk to a persistent, human-in-the-loop Claude Code TUI instead of the deprecated `claude -p` print mode.

Each `claupe -p` invocation enqueues a request with a long-running local daemon. The daemon keeps a real `claude` process alive via a PTY, writes the prompt into it, and waits for Claude itself to pipe the final answer back through `claupe agent <id>`. The waiting client streams that answer to stdout.

## Status

Early development. APIs and flags will change.

## Usage

```sh
claupe -p "summarize this repository"
git diff | claupe -p "review this diff"
claupe -p --session nightly "run the nightly checklist"
claupe -p --resume 018f... "continue from this conversation"
```

## Install (from source)

```sh
git clone <repo>
cd claupe
npm install
npm run build
npm link
```
