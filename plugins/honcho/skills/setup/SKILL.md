---
description: First-time Honcho configuration -- set API key, validate connection, create config
user-invocable: true
---

# Honcho Setup

Walk the user through first-time Honcho configuration so persistent memory works in Claude Code.

## Steps

### 1. Check current state

Run this command to check if `HONCHO_API_KEY` is already set:

```bash
echo "${HONCHO_API_KEY:+set}"
```

If the output is `set`, skip to step 3 (validation). Otherwise continue.

### 2. Direct user to get an API key

Tell the user:

> You need a Honcho API key. Get one for free at https://app.honcho.dev
>
> Once you have it, add this line to your shell config (`~/.zshrc` or `~/.bashrc`):
> ```
> export HONCHO_API_KEY="your-key-here"
> ```
>
> Then restart Claude Code so it picks up the new environment variable.

Wait for the user to confirm they have set the key. If they paste the key directly in chat, warn them not to share API keys in conversation and remind them to set it as an environment variable instead.

### 3. Validate the API key

Test the connection by running the setup runner. Find the plugin directory first:

```bash
HONCHO_PLUGIN="${HONCHO_PLUGIN_DIR:-$HOME/.honcho/plugins/claude-honcho/plugins/honcho}"
bun run "$HONCHO_PLUGIN/src/skills/setup-runner.ts"
```

If it succeeds, the key is valid and the config file has been created.

If it fails, help the user troubleshoot:
- Key not set: re-check shell config and restart Claude Code
- Authentication error: key may be invalid, get a new one from https://app.honcho.dev
- Network error: check internet connection
- Plugin not found: check that claude-honcho is installed at `~/.honcho/plugins/claude-honcho`

### 4. Confirm setup

Tell the user that Honcho is configured and memory will be active on their next session. Suggest they restart Claude Code or open a new chat to see the memory context load.
