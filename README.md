# claupe

> A headless wrapper around the `claude` TUI for programmatic use.

Claude supports programmatic access via `claude -p`, but that usage is billed separately from your interactive subscription and can get expensive. `claupe` is a wrapper around the `claude` TUI that allows you to use it in a headless way, so your requests still bill against your interactive subscription instead.

## How to use it

Install it globally using:

```sh
npm install -g claupe
```

Then you can run:

```sh
claupe "<prompt>"              # positional prompt
git diff | claupe "review"     # stdin is appended to the prompt
claupe -p "<prompt>"           # -p accepted for muscle memory
```

Each invocation is a fresh `claude` conversation. You can use `claupe` in scripts, cron jobs, or just for quick questions in the terminal.

## Caveats

- Every call cold-starts claude (~3s). Fine for cron and one-shot scripts; bad for tight loops.
- `--dangerously-skip-permissions` is required so claude can run the callback unattended. Only run claupe in workspaces where that's acceptable.
- No defense against prompt injection in piped stdin. If you `cat untrusted.txt | claupe ...` and the file contains adversarial instructions, claude may follow them. With `--dangerously-skip-permissions` that includes shell commands. Only pipe content you trust.
- The interactive/programmatic split is Anthropic's call, not a hard technical line. If they later decide to flag TUI traffic that comes from a PTY without a real human, this trick stops working.

## License

MIT License
