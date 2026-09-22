---
description: First-time Honcho configuration -- set API key, validate connection, create config
user-invocable: true
---

# Honcho Setup

Walk the user through first-time Honcho configuration so persistent memory works in Claude Code.

## Steps

### 1. Validate the connection

Run the setup runner. It's a committed script (`src/skills/setup-runner.ts`) that
checks for an API key (env var, then `~/.honcho/config.json`), validates the
connection, writes the config, and installs the memory statusLine:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/skills/setup-runner.js"
```

If `CLAUDE_PLUGIN_ROOT` isn't set, the plugin lives here (find the version
directory inside and run the runner from there):

```bash
echo "$HOME/.claude/plugins/cache/honcho/honcho"
```

**If the runner reports "No API key found"**, it prints how to set one and exits.
Relay that to the user:

- Get a free key at https://app.honcho.dev
- **macOS / Linux:** add to `~/.zshrc` (or `~/.bashrc`): `export HONCHO_API_KEY="your-key-here"`
- **Windows (PowerShell):** `setx HONCHO_API_KEY "your-key-here"`
- Then restart Claude Code and run `/honcho:setup` again.

Do NOT ask the user to paste their key into the chat — it must be set as an
environment variable outside Claude Code. Stop here and wait for them to come back.

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
