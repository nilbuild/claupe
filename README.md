# claupe

`claupe` is a one-shot wrapper that drives a real `claude` TUI for scripts and cron jobs, so you keep the human-in-the-loop conversation model (and your Claude subscription) instead of falling back to the API-billed `claude -p`.

Each `claupe` invocation is self-contained: spawn `claude` in a PTY, paste a small envelope into it, wait for `claude` itself to pipe the final answer back through `claupe agent <id>`, print it, and exit. No daemon, no socket, no background processes.

## Status

Early development. Flags and on-disk layout will change without notice.

## Install (from source)

```sh
git clone <repo>
cd claupe
npm install
npm run build
npm link            # exposes `claupe` on $PATH
```

## Usage

```sh
claupe "summarize this repository"
git diff | claupe "review this diff"
claupe --session nightly "run the nightly checklist"
claupe --resume 018f... "continue from this conversation"
claupe --output-format json "..."
```

The `-p` / `--print` flag is accepted for `claude -p` muscle-memory but is a no-op; bare prompts work the same way.

Inspect or forget the stored resume ids:

```sh
claupe status
claupe reset --session nightly
```

## How it works

For each invocation:

1. `claupe` generates a request id and creates a named FIFO at `$TMPDIR/claupe-<id>.fifo`.
2. It spawns `claude --dangerously-skip-permissions [--resume <id>]` via a PTY and starts reading the FIFO asynchronously.
3. After a short boot delay, it pastes an envelope into the PTY containing the user's prompt and a closing instruction to pipe the final answer to `claupe agent <id>` exactly once.
4. Claude executes that command. `claupe agent` opens the FIFO for writing and pipes its stdin through.
5. The parent process streams those bytes to its own stdout. When the FIFO closes, claupe kills the PTY and exits.

Resuming: pass `--resume <id>` once and the resume id is persisted per session name. Subsequent calls to that session reuse it automatically until `claupe reset --session <name>`.

## Configuration

Environment variables:

| Var | Purpose | Default |
| --- | --- | --- |
| `CLAUPE_STATE_DIR` | Where `sessions.json` lives | `~/.config/claupe` |
| `CLAUPE_FIFO_DIR` | Where per-request FIFOs are created | `$TMPDIR` |
| `CLAUPE_CLAUDE_BIN` | Path to the `claude` binary | `claude` (from PATH) |
| `CLAUPE_READY_IDLE_MS` | PTY-idle window before pasting the envelope | `500` |
| `CLAUPE_READY_MAX_WAIT_MS` | Max wait for the PTY to ever go idle | `15000` |
| `CLAUPE_TIMEOUT_MS` | Max wait for claude to run the agent callback | `300000` |

## Notes

- The Claude TUI is not a machine-output protocol. claupe avoids scrollback scraping; the final answer comes back through the `claupe agent` callback, which is much less fragile.
- Concurrent claupe invocations against the same `--session` will load the same resume id in parallel; their conversations will diverge from that ancestor. Use distinct session names if you run them in parallel.
- `--dangerously-skip-permissions` is required so Claude can run the callback command without stopping at an approval prompt. Only use claupe in workspaces where you are comfortable with that.
- Every call pays Claude's TUI cold-start (~3s). If that becomes a bottleneck, a warm-pool mode can be added behind a flag later.
