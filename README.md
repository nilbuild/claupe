# claupe

`claude -p` for your subscription, not the API.

```sh
claupe "summarize this repo"
git diff | claupe "review this diff"
```

Each invocation spawns a real `claude` TUI in a PTY, runs your prompt through it, prints the answer to stdout, exits. No daemon, no API key, no scrollback scraping.

## Install

Needs Node 20+ and the `claude` CLI on `$PATH`.

```sh
git clone https://github.com/kamranahmedse/claupe
cd claupe
npm install
npm run build
npm link
```

## Use

```sh
claupe "<prompt>"                            # positional prompt
git diff | claupe "review"                   # stdin is appended to the prompt
claupe -p "<prompt>"                         # -p accepted for claude -p muscle memory
claupe --output-format json "<prompt>"       # json result instead of plain text
```

### Sessions

Resume IDs are sticky per `--session` name (default `"default"`). Set one once, future calls reuse it.

```sh
claupe --session work --resume 018f-abc...   "remember the number 42"
claupe --session work                        "what number did I ask you to remember?"
# 42
```

```sh
claupe status                                # list stored sessions
claupe reset --session work                  # forget the stored resume id
```

## How it works

claupe spawns `claude --dangerously-skip-permissions [--resume <id>]` in a PTY and creates a named FIFO at `$TMPDIR/claupe-<req>.fifo`. Once claude is idle, claupe pastes an envelope into the PTY containing your prompt plus a closing instruction: pipe the final answer to `claupe agent <req>`.

Claude runs that command. Its bytes flow through the FIFO back to the waiting parent process, which prints them to stdout. When the FIFO closes, claupe kills the PTY and exits.

The point of routing through `claupe agent` and a FIFO instead of reading claude's TUI output: the TUI is not a machine-output protocol. Scraping it is fragile. The answer comes through a side channel we control.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAUPE_STATE_DIR` | `~/.config/claupe` | Where `sessions.json` lives |
| `CLAUPE_FIFO_DIR` | `$TMPDIR` | Where per-request FIFOs are created |
| `CLAUPE_CLAUDE_BIN` | `claude` | Path to the `claude` binary |
| `CLAUPE_READY_IDLE_MS` | `800` | PTY-idle window before pasting the envelope |
| `CLAUPE_READY_MAX_WAIT_MS` | `30000` | Max wait for the PTY to ever go idle |
| `CLAUPE_TIMEOUT_MS` | `300000` | Max wait for claude to respond after paste |
| `CLAUPE_BOOT_DELAY_MS` | `0` | If set, use this fixed sleep instead of idle detection |

## Caveats

- Every call cold-starts claude (~3s). Fine for cron and scripts, not for tight loops.
- `--dangerously-skip-permissions` is required so claude can run the callback unattended. Only run claupe where that's acceptable.
- `--output-format stream-json` doesn't truly stream — claude buffers its full answer before piping it, so you currently get a single chunk plus the final result event.
- Prompts are wrapped in `BEGIN-USER-REQUEST` / `END-USER-REQUEST` markers and tagged as data, but prompt injection is not fully prevented.

## License

MIT — see [LICENSE](./LICENSE).
