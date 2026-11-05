---
description: First-time Honcho configuration -- sign in or set an API key, validate connection, create config
user-invocable: true
---

# Honcho Setup

Walk the user through first-time Honcho configuration so persistent memory works in Claude Code.

## Steps

### 1. Validate the connection

Run the setup runner. It's a committed script (`src/skills/setup-runner.ts`) that
looks for a credential (the `HONCHO_API_KEY` env var, a Honcho sign-in, or an
`apiKey` in `~/.honcho/config.json`), validates the connection, writes the config,
and installs the memory statusLine:

```bash
bun run "${CLAUDE_PLUGIN_ROOT}/src/skills/setup-runner.ts"
```

If `CLAUDE_PLUGIN_ROOT` isn't set, the plugin lives here (find the version
directory inside and run the runner from there):

```bash
echo "$HOME/.claude/plugins/cache/honcho/honcho"
```

**If it exits with code 2 ("Not connected to Honcho")**, ask the user how they want
to connect using the AskUserQuestion tool (a picker), with one option for each
connection method the runner printed:

- **Sign in with your browser** (Honcho cloud): run the runner again with
  `--sign-in`. It opens the browser, prints a link and code, and exits with code 3.
  Give the user the link and code, ask them to approve, and wait for them to say
  they have. Then run the runner again without `--sign-in` to finish.
- **Use an API key**: relay how to set it:
  - Get a free key at https://app.honcho.dev
  - **macOS / Linux:** add to `~/.zshrc` (or `~/.bashrc`): `export HONCHO_API_KEY="your-key-here"`
  - **Windows (PowerShell):** `setx HONCHO_API_KEY "your-key-here"`
  - Then restart Claude Code and run `/honcho:setup` again.

  Do NOT ask the user to paste their key into the chat — it must be set as an
  environment variable outside Claude Code. Stop here and wait for them to come back.

If the runner only lists the API key (self-hosted Honcho), relay that without asking.

**If it exits with code 3 without `--sign-in`**, the sign-in isn't approved yet:
relay the link and code it printed and ask the user to say when they've approved.

**If the runner succeeds**, the key is valid and the config file has been created.
The statusLine renderer is copied to `~/.honcho/honcho-statusline.sh` and registered
in `~/.claude/settings.json` (only when no `statusLine` is already configured — an
existing one is left untouched and the path is printed for manual use). Toggle
visibility later with the `statusline` key in `~/.honcho/config.json`: `on`
(default) or `off`.

If it fails for another reason:
- Authentication error: key may be invalid — get a new one at https://app.honcho.dev
- Network error: check the internet connection

### 2. Confirm setup

Tell the user that Honcho is configured and memory will be active on their next session. Suggest they restart Claude Code to see the memory context load.

If the setup runner (step 1) reported that past local sessions are available to
import, mention it as an optional next step — do **not** import here. Point them to
the dedicated command:

> You also have past Claude Code sessions that can be imported into Honcho.
> Run `/honcho:import` whenever you'd like to backfill them.
