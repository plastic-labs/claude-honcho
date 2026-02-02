# Honcho Memory for Claude Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Honcho](https://img.shields.io/badge/Honcho-Memory%20API-blue)](https://honcho.dev)

**Persistent memory for Claude Code using [Honcho](https://honcho.dev) by Plastic Labs.**

Give Claude Code long-term memory that survives context wipes, session restarts, and even `ctrl+c`. Claude remembers what you're working on, your preferences, and what it was doing — across all your projects.

---

## Quick Start (5 minutes)

### Step 1: Get Your Honcho API Key

1. Go to **[app.honcho.dev](https://app.honcho.dev)**
2. Sign up or log in
3. Copy your API key (starts with `hch-`)

### Step 2: Set Environment Variables

Add these to your shell config (`~/.zshrc`, `~/.bashrc`, or `~/.profile`):

```bash
# Required
export HONCHO_API_KEY="hch-your-api-key-here"

# Optional (defaults shown)
export HONCHO_PEER_NAME="$USER"           # Your name/identity
export HONCHO_WORKSPACE="claude_code"     # Workspace name
```

Then reload your shell:

```bash
source ~/.zshrc  # or ~/.bashrc
```

### Step 3: Install the Plugin

Open Claude Code and run:

```
/plugin marketplace add plastic-labs/honcho-claude-code-plugin
```

Then install:

```
/plugin install honcho@honcho-memory
```

### Step 4: Restart Claude Code

```bash
# Exit Claude Code (ctrl+c or /exit)
# Start it again
claude
```

**That's it!** You should see the Honcho pixel art and memory loading on startup.

---

## What You Get

- **Persistent Memory** — Claude remembers your preferences, projects, and context across sessions
- **Survives Context Wipes** — Even when Claude's context window resets, memory persists
- **Git Awareness** — Detects branch switches, commits, and changes made outside Claude
- **Per-Project Sessions** — Each directory has its own conversation history
- **AI Self-Awareness** — Claude knows what it was working on, even after restarts

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HONCHO_API_KEY` | **Yes** | — | Your Honcho API key from [app.honcho.dev](https://app.honcho.dev) |
| `HONCHO_PEER_NAME` | No | `$USER` | Your identity in the memory system |
| `HONCHO_WORKSPACE` | No | `claude_code` | Workspace name (groups your sessions) |
| `HONCHO_CLAUDE_PEER` | No | `claude` | How the AI is identified |
| `HONCHO_ENDPOINT` | No | `production` | `production`, `local`, or a custom URL |
| `HONCHO_ENABLED` | No | `true` | Set to `false` to disable |
| `HONCHO_SAVE_MESSAGES` | No | `true` | Set to `false` to stop saving messages |

### Example Full Configuration

```bash
# ~/.zshrc or ~/.bashrc

# Honcho Memory for Claude Code
export HONCHO_API_KEY="hch-v2-abc123..."
export HONCHO_PEER_NAME="alice"
export HONCHO_WORKSPACE="my-projects"
```

---

## Verifying It Works

After installation, start Claude Code. Just ask Claude if Honcho context is available, or run `/honcho:status`.

---

## Skills (Slash Commands)

| Command | Description |
|---------|-------------|
| `/honcho:status` | Show current memory status and configuration |

---

## Troubleshooting

### "Not configured" or no memory loading

1. **Check your API key is set:**
   ```bash
   echo $HONCHO_API_KEY
   ```
   If empty, add it to your shell config and `source` it.

2. **Check the plugin is installed:**
   ```
   /plugin
   ```
   Go to "Installed" tab — you should see `honcho@honcho-memory`.

3. **Restart Claude Code** after making changes.

### Memory not persisting between sessions

Make sure `HONCHO_SAVE_MESSAGES` is not set to `false`.

### Using a local Honcho instance

```bash
export HONCHO_ENDPOINT="local"  # Uses localhost:8000
# or
export HONCHO_ENDPOINT="http://your-server:8000/v3"
```

### Temporarily disabling memory

```bash
export HONCHO_ENABLED="false"
```

Then restart Claude Code. Set back to `true` (or remove the line) to re-enable.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                              │
├─────────────────────────────────────────────────────────────────┤
│  SessionStart   │  UserPrompt     │  PostToolUse   │ SessionEnd │
│  ───────────    │  ───────────    │  ────────────  │ ────────── │
│  Load context   │  Save message   │  Log activity  │ Upload all │
│  from Honcho    │  to Honcho      │  to Honcho     │ + summary  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Honcho API                              │
│                                                                 │
│   Your messages and Claude's work → Persistent Memory →         │
│   Retrieved as context at session start                         │
└─────────────────────────────────────────────────────────────────┘
```

The plugin hooks into Claude Code's lifecycle events:
- **SessionStart**: Loads your context and history from Honcho
- **UserPrompt**: Saves your messages and retrieves relevant context
- **PostToolUse**: Logs Claude's actions (file edits, commands, etc.)
- **SessionEnd**: Uploads any remaining messages and generates a summary

---

## Uninstalling

```
/plugin uninstall honcho@honcho-memory
/plugin marketplace remove honcho-memory
```

Then remove the environment variables from your shell config if desired.

---

## Links

- **Honcho**: [honcho.dev](https://honcho.dev) — The memory API
- **Documentation**: [docs.honcho.dev](https://docs.honcho.dev)
- **Issues**: [GitHub Issues](https://github.com/plastic-labs/honcho-claude-code-plugin/issues)
- **Plastic Labs**: [plasticlabs.ai](https://plasticlabs.ai)

---

## License

MIT — see [LICENSE](LICENSE)
