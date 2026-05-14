# claupe

`claupe` is a Node.js shim that lets scripts and cron jobs talk to a persistent, human-in-the-loop `claude` TUI instead of the deprecated `claude -p` print mode.

Each `claupe -p` invocation enqueues a request with a long-running local daemon. The daemon keeps a real `claude` process alive through a PTY (no tmux), writes the prompt into it, and waits for Claude itself to pipe the final answer back through `claupe agent <id>`. The waiting client streams that answer to stdout.

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
claupe -p "summarize this repository"
git diff | claupe -p "review this diff"
claupe -p --session nightly "run the nightly checklist"
claupe -p --resume 018f... "continue from this conversation"
claupe -p --output-format json "..."
claupe -p --no-wait "fire and forget"
```

Inspect or reset the daemon:

```sh
claupe status
claupe reset --session nightly
```

`claupe -p` will autostart the daemon if it isn't already running. You can also run it explicitly:

```sh
claupe daemon run
```

## How it works

1. `claupe -p` connects to the local Unix socket and sends an `enqueue` message.
2. The daemon spawns (or reuses) a `claude` PTY for the requested session, started with `--dangerously-skip-permissions` so the callback at the end can run unattended.
3. The daemon pastes an envelope into the PTY. The envelope contains the user's prompt and tells Claude to pipe its final answer to `claupe agent <id>` when it's done.
4. Claude executes that command. `claupe agent` opens its own connection to the daemon, identifies itself with the request id, and streams stdin back.
5. The daemon forwards those bytes to the waiting `claupe -p` client as `chunk` messages, then `done`.

Resuming: pass `--resume <id>` once and the resume id is persisted per session name. Subsequent requests to that session reuse it automatically until you `claupe reset --session <name>`.

## Configuration

Environment variables:

| Var | Purpose | Default |
| --- | --- | --- |
| `CLAUPE_STATE_DIR` | Where the socket, log, and sessions file live | `~/.config/claupe` |
| `CLAUPE_SOCKET` | Override socket path | `$CLAUPE_STATE_DIR/claupe.sock` |
| `CLAUPE_CLAUDE_BIN` | Path to the `claude` binary | `claude` (from PATH) |
| `CLAUPE_BOOT_DELAY_MS` | Time to wait after spawning Claude before pasting | `3000` |

## End-to-end test plan

Until there are automated tests, here is a manual loop:

```sh
# 1. Start the daemon in the foreground so you can watch logs
claupe daemon run

# 2. In another shell, send a prompt
claupe -p "say hello in one word"
# expect: a short answer printed to stdout

# 3. Verify session state survives a daemon restart
claupe -p --session work --resume <some-real-claude-session-id> "remember the number 42"
# (Ctrl-C the daemon, then start it again)
claupe daemon run
# (in another shell)
claupe -p --session work "what number did I ask you to remember?"
# expect: 42

# 4. Tear down
claupe reset --session work
claupe status
```

## Notes

- The Claude TUI is not a machine-output protocol. `claupe` avoids scrollback scraping; the final answer comes back through the `claupe agent` callback, which is much less fragile.
- Concurrent `claupe -p` calls against the same session are serialized inside the daemon. Different session names run in parallel.
- `--dangerously-skip-permissions` is required so Claude can run the callback command without stopping at an approval prompt inside an unattended cron job. Only run claupe in workspaces where you are comfortable with that.
