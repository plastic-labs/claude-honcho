# Honcho Plugins for Claude Code

[![Honcho Banner](./assets/honcho_clawd.png)](https://honcho.dev)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@honcho-ai/claude-honcho)](https://www.npmjs.com/package/@honcho-ai/claude-honcho)
[![Honcho](https://img.shields.io/badge/Honcho-Memory%20API-blue)](https://honcho.dev)

A plugin marketplace for Claude Code, powered by [Honcho](https://honcho.dev) from Plastic Labs.

## Plugins

| Plugin                               | Description                                     |
| ------------------------------------ | ----------------------------------------------- |
| **[honcho](#honcho-plugin)**         | Persistent memory for Claude Code sessions      |
| **[honcho-dev](#honcho-dev-plugin)** | Skills for building AI apps with the Honcho SDK |

---

## Installation

Add the marketplace to Claude Code:

```
/plugin marketplace add plastic-labs/claude-honcho
```

Then install the plugin(s) you want:

```
/plugin install honcho@honcho
/plugin install honcho-dev@honcho
```

You'll need to restart Claude Code for the plugins to take effect. Follow the instructions below for setting up each plugin.

---

# `honcho` Plugin

**Persistent memory for Claude Code using [Honcho](https://honcho.dev).**

Give Claude Code long-term memory that survives context wipes, session restarts, and even `ctrl+c`. Claude remembers what you're working on, your preferences, and what it was doing — across all your projects.

## Prerequisites

- Claude Code v2.1.287 or later
- [Node.js](https://nodejs.org) on your PATH
- A Honcho account at [app.honcho.dev](https://app.honcho.dev)

The plugin ships as a self-contained bundle -- no other dependencies needed.

## Quick Start

### Step 1: Install the plugin

```
/plugin marketplace add plastic-labs/claude-honcho
/plugin install honcho@honcho
```

Then run `/reload-plugins`, or restart Claude Code.

### Step 2: Connect Honcho

Click `○ honcho · set up` in the prompt footer, or run `/honcho setup`. Sign in with your browser, or paste an API key from [app.honcho.dev](https://app.honcho.dev). Your sign-in and key stay in the pane; they never go to Claude.

### Step 3: Start a new session

Run `/clear` or restart Claude Code. Memory loads at the start of each session, and `● honcho` in the footer opens the Honcho pane.

### Step 4 (optional): Teach Honcho about you

- `/honcho:interview` -- Claude asks about your preferences and saves what it learns. It carries across projects.
- `/honcho import` -- add your past Claude Code sessions to Honcho.

## What You Get

- **Persistent Memory** — Claude remembers your preferences, projects, and context across sessions
- **Survives Context Wipes** — Even when Claude's context window resets, memory persists
- **One session per chat** — Each Claude Code chat maps to its own Honcho session
- **AI Self-Awareness** — Claude knows what it was working on, even after restarts
- **Team Support** — Multiple people can share a workspace and build context together
- **MCP Tools** — Search memory and ask Honcho about you, a project scope, or the whole workspace

## MCP Tools

The honcho plugin provides these tools via MCP:

| Tool                 | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `search`             | Semantic search across session messages and derived conclusions |
| `chat`               | Ask Honcho about the user, optionally limited to a `scope`, or about the whole workspace (`workspace: true`) |
| `create_conclusion`  | Save insights about the user to memory                         |
| `list_conclusions`   | List derived conclusions (explicit ones are excluded)          |
| `query_conclusions`  | Semantic search over derived conclusions                       |
| `delete_conclusion`  | Delete a conclusion by ID                                      |
| `get_config`         | View current configuration and status                          |
| `set_config`         | Change any configuration field programmatically                |

## Skills

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `/honcho:interview` | Interview to capture stable, cross-project user preferences |
| `/honcho:insights`  | Distill memory into CLAUDE.md edits, style rules, skill ideas |
| `/honcho`           | Opens the Honcho pane. `/honcho setup` (sign in or enter an API key), `/honcho status`, `/honcho config`, `/honcho set <field> <value>` and `/honcho import` (backfill past sessions; `--yes` to upload) answer at once, without a Claude turn |

**Honcho pane.** Click `● honcho` in the prompt footer, or run `/honcho`, to open a pane beside the chat with a link to this chat's session in Honcho, your dream history and your peer card. Select a dream or the peer card to see it in full.

---

## Configuration

All configuration lives in a single global file at `~/.honcho/config.json`. You can edit it directly, use `/honcho set <field> <value>`, or use the `set_config` MCP tool. Environment variables override the file.

### Config File Reference

```jsonc
{
  "schemaVersion": 2,
  "hosts": {
    "claude_code": {
      "oauth": { "accessToken": "…", "refreshToken": "…", "accessExpiresAt": 1794263473, "clientId": "claude-honcho", "scope": "write" },
      "peerName": "alice",             // asked during /honcho setup
      "workspace": "claude_code",
      "aiPeer": "claude"
    }
  }
}
```

`/honcho setup` writes one of two credentials:

- `oauth`: "Sign in with your browser". Your Claude Code sign-in to Honcho cloud, refreshed automatically. Other Honcho plugins keep their own.
- `apiKey`: "Use an API key", for a key from app.honcho.dev or a self-hosted Honcho (`"baseUrl": "http://localhost:8000"`; browser sign-in is cloud-only).

`HONCHO_API_KEY` overrides both.

Each plugin keeps its settings in its own block under `hosts`; nothing at the top level is read. If your file still has top-level settings or old key names, the plugin copies them into `hosts.claude_code` at session start and says so once; `honcho doctor` in the Honcho CLI cleans up the rest. Logs go to `~/.honcho/activity.log`. To turn the plugin off, disable it in Claude Code's `/plugin` menu.

### Sessions

Each Claude Code chat maps to one Honcho session whose id is the Claude Code session id. Resuming a chat continues its session; `/clear` and new chats start a new one. Memory about you still carries across every chat in the workspace.

New sessions also join two Honcho scopes: one named after the git repository (worktrees share the main repo's name; outside git, the directory name) and one named after the machine's hostname. Use them to query memory from just one project or one machine.

This mapping isn't configurable. If you want a different session layout, connect to Honcho through the [Honcho MCP server](https://mcp.honcho.dev) and manage sessions yourself.

### Memory Injection

At session start the plugin injects two things:

- **Directives**: how to use Honcho memory. Treat it as background, recall with the `chat` tool (naming this chat's repo and machine scopes), and save insights with `create_conclusion`.
- **Your peer card**: a structured identity/attribute list.

Nothing is injected per prompt, and nothing is fetched with `context()`. Tools that read conclusions (`search`, `list_conclusions`, `query_conclusions`) return only derived conclusions; explicit ones are filtered out. Claude recalls memory when it needs it by calling `chat`:

- **About you** (default): an answer from everything Honcho knows about you.
- **Within a scope**: pass `scope` (e.g. the repo name) to answer only from that scope's sessions.
- **Across the workspace**: pass `workspace: true` to ask about every peer in the workspace.

Configure it with `/honcho set`, `set_config`, or by editing `~/.honcho/config.json`.

### Host-Aware Configuration

The plugin auto-detects which tool is running it (Claude Code, Cursor, etc.) and reads the matching block from `hosts`. Each host gets its own workspace and AI peer name, so data stays separated by default.

**Host detection priority:**
1. `HONCHO_HOST` env var (explicit override)
2. `cursor_version` in hook stdin (Cursor detected)
3. `CURSOR_PROJECT_DIR` env var (Cursor child process)
4. Default: `claude_code`

### Team Setup with Shared Context

Multiple people can share context by pointing to the same workspace. Each person uses their own `peerName` as identity.

**Person A** (`~/.honcho/config.json`):
```json
{
  "hosts": {
    "claude_code": {
      "apiKey": "hch-v2-team-key...",
      "peerName": "alice",
      "workspace": "team-acme",
      "aiPeer": "claude"
    }
  }
}
```

**Person B** (`~/.honcho/config.json`):
```json
{
  "hosts": {
    "claude_code": {
      "apiKey": "hch-v2-team-key...",
      "peerName": "bob",
      "workspace": "team-acme",
      "aiPeer": "claude"
    }
  }
}
```

Both Alice and Bob write to the `team-acme` workspace. Each chat has its own session, so data doesn't collide, but Honcho's dialectic reasoning can draw on context from both users.

### Environment Variables

Environment variables override `hosts.claude_code` in `~/.honcho/config.json`.

| Variable               | Required | Default       | Description                                                       |
| ---------------------- | -------- | ------------- | ----------------------------------------------------------------- |
| `HONCHO_API_KEY`       | **Yes**  | —             | Your Honcho API key from [app.honcho.dev](https://app.honcho.dev) |
| `HONCHO_PEER_NAME`     | No       | `$USER`       | Your identity in the memory system                                |
| `HONCHO_WORKSPACE`     | No       | `claude_code` | Workspace name                                                    |
| `HONCHO_AI_PEER`       | No       | `claude`      | AI peer name                                                      |
| `HONCHO_HOST`          | No       | auto-detected | Force host detection: `claude_code`, `cursor`, or `obsidian`      |
| `HONCHO_BASE_URL`      | No       | Honcho cloud  | Honcho API URL                                                    |

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                              │
├─────────────────────────────────────────────────────────────────┤
│  SessionStart   │  UserPrompt     │  Stop          │ SessionEnd │
│  ───────────    │  ───────────    │  ────────────  │ ────────── │
│  Load peer card │  Save message   │  Save Claude's │ Clean up   │
│  + directives   │  to Honcho      │  reply         │            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Honcho API                              │
│                                                                 │
│   Your messages and Claude's replies → Persistent Memory →      │
│   Recalled on demand through the chat tool                      │
└─────────────────────────────────────────────────────────────────┘
```

The plugin hooks into Claude Code's lifecycle events:

- **SessionStart**: Joins this chat's session to its repo and machine scopes, and injects the memory directives and your peer card
- **UserPrompt**: Saves your messages (nothing is retrieved per turn; Claude calls `chat` when it needs memory)
- **Stop**: Saves Claude's replies
- **SessionEnd**: Clears local per-chat state

## Troubleshooting

### "Not configured" or no memory loading

1. **Check your API key is set:**

   ```bash
   echo $HONCHO_API_KEY          # macOS / Linux
   echo $env:HONCHO_API_KEY      # Windows PowerShell
   ```

   If empty, run `/honcho setup`, or set it (see the environment-variable setup near the end) and restart your terminal.

2. **Check the plugin is installed:**

   ```
   /plugin
   ```

   You should see `honcho@honcho` in the list.

3. **Restart Claude Code** after making changes.

4. **Run `/honcho status`** to see connection state, workspace, and session info.

### Using a local Honcho instance

Via config file:
```json
{ "hosts": { "claude_code": { "baseUrl": "http://localhost:8000" } } }
```

Or via env var:
```bash
export HONCHO_BASE_URL="http://localhost:8000"
```

### Temporarily disabling memory

Disable the plugin in Claude Code's `/plugin` menu, and enable it again when you're done.

---

# `honcho-dev` Plugin

**Skills for building AI applications with the Honcho SDK.**

This plugin provides skills to help you integrate Honcho into your projects and migrate between SDK versions.

## Skills

| Command                  | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `/honcho-dev:integrate`  | Add Honcho memory to your project or bot framework |
| `/honcho-dev:migrate-py` | Migrate Python code to the latest Honcho SDK       |
| `/honcho-dev:migrate-ts` | Migrate TypeScript code to the latest Honcho SDK   |

## Installation

```
/plugin install honcho-dev@honcho
```

---

## Uninstalling

```
/plugin uninstall honcho@honcho
/plugin uninstall honcho-dev@honcho
/plugin marketplace remove honcho
```

Then remove the environment variables from your shell config if desired.

<details>
<summary>Claude Code before v2.1.287: set up with environment variables</summary>

Older Claude Code versions don't load the plugin's mod, so there is no `/honcho` command or Honcho pane. Memory still works once a key is set.

1. Get an API key (starts with `hch-`) at [app.honcho.dev](https://app.honcho.dev).
2. Set it in your environment.

**macOS / Linux** -- add these to your shell config (`~/.zshrc`, `~/.bashrc`, or `~/.profile`):

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

**Windows (PowerShell)** -- set a persistent user environment variable:

```powershell
# Required
[Environment]::SetEnvironmentVariable("HONCHO_API_KEY", "hch-your-api-key-here", "User")

# Optional
[Environment]::SetEnvironmentVariable("HONCHO_PEER_NAME", $env:USERNAME, "User")
[Environment]::SetEnvironmentVariable("HONCHO_WORKSPACE", "claude_code", "User")
```

Then restart your terminal so the new variables take effect.

3. Install the plugin (Step 1 above) and restart Claude Code.

</details>

---

## License

MIT — see [LICENSE](LICENSE)

---

## Links

- **Issues**: [GitHub Issues](https://github.com/plastic-labs/honcho/issues)
- **Discord**: [Join the Community](https://discord.gg/plasticlabs)
- **X (Twitter)**: [@honchodotdev](https://x.com/honchodotdev)
- **Plastic Labs**: [plasticlabs.ai](https://plasticlabs.ai)
- **Honcho**: [honcho.dev](https://honcho.dev) — The memory API
- **Documentation**: [docs.honcho.dev](https://docs.honcho.dev)
- **Blog**: [Read about Honcho, Agents, and Memory](https://blog.plasticlabs.ai)
