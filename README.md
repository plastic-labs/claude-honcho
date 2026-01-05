# honcho-clawd

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![Honcho](https://img.shields.io/badge/Honcho-Memory%20API-blue)](https://honcho.dev)

**Persistent memory for Claude Code sessions using [Honcho](https://honcho.dev) by Plastic Labs.**

Give Claude Code long-term memory that survives context wipes, session restarts, and even `ctrl+c` interruptions. Built on Honcho's memory framework for rich, semantic understanding.

## Features

- **Persistent Memory**: User messages and AI responses are saved to Honcho, building long-term context
- **Survives Interruptions**: Local message queue ensures no data loss on `ctrl+c` or crashes
- **AI Self-Awareness**: Claude knows what it was working on, even after context is wiped
- **Dual Peer System**: Separate memory for user (you) and AI (claudis)
- **Semantic Search**: Relevant context is retrieved based on your current prompt
- **Cost-Optimized**: Configurable refresh rates and caching to minimize API costs
- **Ultra-Fast Hooks**: 98% latency reduction through caching, parallelization, and fire-and-forget patterns
- **Per-Directory Sessions**: Each project directory maintains its own conversation history
- **Claude Code Skills**: Built-in slash commands for session management

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Claude Code Skills](#claude-code-skills)
- [Cost Optimization](#cost-optimization)
- [Architecture](#architecture)
- [Performance](#performance)
- [AI Self-Awareness](#ai-self-awareness)
- [Reliability](#reliability)
- [CLI Reference](#cli-reference)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Credits](#credits)

---

## Installation

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- [Claude Code](https://claude.ai/code) CLI
- [Honcho](https://honcho.dev) account and API key

### Install from Source

```bash
# Clone the repository
git clone https://github.com/erosika/honcho-claudis.git
cd honcho-claudis

# Install dependencies
bun install

# Build
bun run build

# Install globally
bun link
```

### Install from npm (coming soon)

```bash
bun install -g honcho-claudis
```

---

## Quick Start

### 1. Initialize Configuration

```bash
honcho-claudis init
```

You'll be prompted for:
- **Your name/peer ID**: How Honcho identifies you (e.g., "yourname")
- **Workspace name**: Your Honcho workspace (e.g., "myworkspace")
- **Claude's peer name**: AI identity in Honcho (default: "claudis")
- **Enable message saving**: Whether to save conversation history
- **Honcho API key**: Get from https://app.honcho.dev

### 2. Install Hooks

```bash
honcho-claudis install
```

This adds hooks to `~/.claude/settings.json` that activate automatically.

### 3. Use Claude Code

```bash
# Start Claude Code in any directory
claude

# Your conversations are automatically saved and context is retrieved!
```

---

## How It Works

### The Honcho Memory System

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
├─────────────────────────────────────────────────────────────────┤
│  SessionStart     │  UserPrompt      │  PostToolUse  │ SessionEnd│
│  ─────────────    │  ───────────     │  ────────────  │ ──────── │
│  Load context     │  Queue message   │  Log tool use  │ Batch    │
│  from Honcho +    │  locally (1ms)   │  locally (2ms) │ upload   │
│  local claudis    │  Fire-and-forget │  Fire-and-     │ messages │
│  summary          │  upload          │  forget upload │ Generate │
│                   │  Cached context  │                │ summary  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Honcho API                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │Workspace │  │ Session  │  │    Peers     │  │  Messages   │ │
│  │(workspace)│──│(project) │──│ user/claudis │──│ (history)   │ │
│  └──────────┘  └──────────┘  └──────────────┘  └─────────────┘ │
│                                     │                           │
│                    ┌────────────────┴────────────────┐          │
│                    │       Persistent Memory         │          │
│                    │  • Explicit Facts               │          │
│                    │  • Deductive Insights           │          │
│                    │  • Peer Cards (profiles)        │          │
│                    │  • Semantic Search              │          │
│                    └─────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Dual Peer System

honcho-claudis creates two "peers" in Honcho:

| Peer | Represents | Observes | Purpose |
|------|------------|----------|---------|
| `user` (you) | The user | Self | Build knowledge about your preferences, projects, style |
| `claudis` | Claude AI | You | Build knowledge about what Claude has done, AI self-awareness |

This enables Claude to understand both what **you** know/want and what **it** has been working on.

---

## Configuration

### Config File

Located at `~/.honcho-claudis/config.json`:

```json
{
  "peerName": "yourname",
  "apiKey": "hch-v2-...",
  "workspace": "myworkspace",
  "claudePeer": "claudis",
  "saveMessages": true,
  "sessions": {
    "/path/to/project": "project-name"
  },
  "contextRefresh": {
    "messageThreshold": 30,
    "ttlSeconds": 300,
    "skipDialectic": true
  },
  "messageUpload": {
    "maxUserTokens": null,
    "maxAssistantTokens": null,
    "summarizeAssistant": false
  }
}
```

### Core Options

| Option | Description | Default |
|--------|-------------|---------|
| `peerName` | Your identity in Honcho | (required) |
| `apiKey` | Honcho API key | (required) |
| `workspace` | Honcho workspace name | `"collab"` |
| `claudePeer` | AI identity in Honcho | `"claudis"` |
| `saveMessages` | Save conversation history | `true` |
| `sessions` | Directory → session mappings | `{}` |

### Context Refresh Options

Control how often context is fetched from Honcho:

| Option | Description | Default |
|--------|-------------|---------|
| `contextRefresh.messageThreshold` | Refresh every N messages | `30` |
| `contextRefresh.ttlSeconds` | Cache TTL in seconds | `300` (5 min) |
| `contextRefresh.skipDialectic` | Skip expensive `chat()` calls | `true` |

### Message Upload Options (for token-based pricing)

| Option | Description | Default |
|--------|-------------|---------|
| `messageUpload.maxUserTokens` | Truncate user messages | `null` (no limit) |
| `messageUpload.maxAssistantTokens` | Truncate assistant messages | `null` (no limit) |
| `messageUpload.summarizeAssistant` | Summarize instead of full text | `false` |

---

## Claude Code Skills

honcho-claudis includes slash commands you can use directly in Claude Code:

### Available Commands

| Command | Description |
|---------|-------------|
| `/honcho-claudis-new [name]` | Create or connect to a Honcho session |
| `/honcho-claudis-list` | List all Honcho sessions |
| `/honcho-claudis-status` | Show current session and memory status |
| `/honcho-claudis-switch <name>` | Switch to a different session |
| `/honcho-claudis-clear` | Clear custom session (revert to default) |

### Usage Example

```
You: /honcho-claudis-status

Claude: Current Honcho session status:
- Workspace: myworkspace
- Session: my-project
- User Peer: yourname
- AI Peer: claudis
- Message Saving: enabled
```

---

## Cost Optimization

### Honcho Pricing (Current)

| API Call | Cost | When Used |
|----------|------|-----------|
| `messages.create()` | $0.001/msg | Every user/assistant message |
| `getContext()` | Free | Context retrieval |
| `chat()` (dialectic) | $0.03/call | LLM reasoning queries |

### Default Cost-Optimized Settings

honcho-claudis is configured to minimize costs by default:

1. **Dialectic calls (`chat()`) skipped in user-prompt** - Only called at session-start
2. **5-minute context cache** - Reduces redundant `getContext()` calls
3. **30-message refresh threshold** - Balances freshness vs. API calls

### Estimated Costs per Session

| Session Length | Messages | Estimated Cost |
|----------------|----------|----------------|
| Short (10 msgs) | ~10 | ~$0.07 |
| Medium (30 msgs) | ~30 | ~$0.09 |
| Long (100 msgs) | ~100 | ~$0.16 |

### Further Cost Reduction

To reduce costs further, edit `~/.honcho-claudis/config.json`:

```json
{
  "contextRefresh": {
    "messageThreshold": 100,    // Refresh less often
    "ttlSeconds": 600,          // 10-minute cache
    "skipDialectic": true       // Already default
  }
}
```

---

## Architecture

### File Structure

```
~/.honcho-claudis/
├── config.json           # User settings (API key, workspace, peer names)
├── cache.json            # Cached Honcho IDs (workspace, session, peers)
├── context-cache.json    # Pre-warmed context with TTL tracking
├── message-queue.jsonl   # Local message queue (reliability layer)
└── claudis-context.md    # AI self-summary (survives context wipes)
```

### Source Structure

```
src/
├── cli.ts              # Main CLI entry point
├── config.ts           # Config management + helpers
├── cache.ts            # Caching layer (IDs, context, message queue)
├── install.ts          # Hook installation to Claude settings
├── spinner.ts          # Loading animation
└── hooks/
    ├── session-start.ts    # Load context from Honcho + local
    ├── session-end.ts      # Save messages + generate summary
    ├── post-tool-use.ts    # Log tool usage + update local context
    └── user-prompt.ts      # Queue message + retrieve context
```

---

## Performance

### Hook Latencies

| Hook | Latency | What It Does |
|------|---------|--------------|
| SessionStart | ~400ms | Load all context (parallel API calls) |
| UserPromptSubmit | ~10-20ms | Queue locally, fire-and-forget upload |
| PostToolUse | ~5ms | Log locally, fire-and-forget upload |
| SessionEnd | ~500ms | Batch upload, generate summary |

### Optimization Techniques

1. **Local Message Queue**: Messages written to file instantly (~1ms), uploaded asynchronously
2. **ID Caching**: Workspace, session, peer IDs cached to skip redundant API calls
3. **Context Caching**: Retrieved context cached with configurable TTL
4. **Parallel API Calls**: All context fetches happen in parallel with `Promise.allSettled`
5. **Fire-and-Forget**: Non-critical uploads don't block the user
6. **Conditional Execution**: Trivial prompts ("yes", "ok") skip heavy context retrieval

---

## AI Self-Awareness

### The Problem

Claude Code's context window can be wiped or compacted at any time. When this happens, Claude forgets what it was working on.

### The Solution

honcho-claudis maintains **claudis self-context** - a persistent record of Claude's work that survives context wipes.

### How It Works

1. **PostToolUse**: Every significant action (file writes, edits, commands) is logged to `~/.honcho-claudis/claudis-context.md`
2. **SessionEnd**: A summary of Claude's work is generated and saved to Honcho
3. **SessionStart**: Claude receives both:
   - **Local context**: Instant read from `claudis-context.md`
   - **Honcho context**: Observations and patterns from Honcho's memory system

### Example

After a context wipe, Claude still knows:

```markdown
## Claudis Local Context (What I Was Working On)

Last updated: 2026-01-05T08:41:00.000Z
Session: my-project

## Recent Activity
- [2026-01-05T08:30:00.000Z] Edited src/hooks/user-prompt.ts
- [2026-01-05T08:35:00.000Z] Ran: bun run build (success)
- [2026-01-05T08:40:00.000Z] Created/wrote file: README.md
```

---

## Reliability

### Message Persistence Layers

1. **Instant Local Write**: Every user message immediately written to `message-queue.jsonl`
2. **Background Upload**: Messages asynchronously uploaded to Honcho
3. **Batch Reconciliation**: Any missed uploads processed on session end

### Failure Scenarios

| Scenario | Data Loss? | Recovery |
|----------|------------|----------|
| `ctrl+c` exit | No | Local queue preserved, uploaded next session |
| Network failure | No | Local queue + retry on reconnection |
| Claude context wipe | No | Context restored from Honcho + local files |
| Honcho API down | Partial | Local queue preserves user messages |

---

## CLI Reference

```
honcho-claudis <command>

Commands:
  init        Configure honcho-claudis (name, API key, workspace)
  install     Install hooks to ~/.claude/settings.json
  uninstall   Remove hooks from Claude settings
  status      Show current configuration and hook status
  help        Show help message

Session Commands:
  session new [name]     Create/connect Honcho session (defaults to dir name)
  session list           List all sessions
  session current        Show current session info
  session switch <name>  Switch to existing session
  session clear          Remove custom session mapping

Hook Commands (internal - called by Claude Code):
  hook session-start    Handle SessionStart event
  hook session-end      Handle SessionEnd event
  hook post-tool-use    Handle PostToolUse event
  hook user-prompt      Handle UserPromptSubmit event
```

---

## Troubleshooting

### Hooks Not Working

1. Check hooks are installed:
   ```bash
   honcho-claudis status
   ```

2. Verify `~/.claude/settings.json` contains honcho-claudis hooks

3. Check the hook binary is accessible:
   ```bash
   which honcho-claudis
   ```

### Slow Performance

1. Clear stale caches:
   ```bash
   rm ~/.honcho-claudis/cache.json
   rm ~/.honcho-claudis/context-cache.json
   ```

2. First request after cache clear will be slower (populating cache)

### No Context Loading

1. Verify API key is valid in `~/.honcho-claudis/config.json`
2. Check Honcho dashboard for your workspace/session
3. Ensure `saveMessages` is `true` in config

### High Costs

1. Increase `contextRefresh.messageThreshold` to refresh less often
2. Increase `contextRefresh.ttlSeconds` for longer cache
3. Ensure `contextRefresh.skipDialectic` is `true`

---

## Development

### Build from Source

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev <command>

# Build for production
bun run build

# The built CLI is at dist/cli.js
```

### Testing Hooks Locally

```bash
# Test session-start
echo '{"cwd": "/tmp/test"}' | bun run dev hook session-start

# Test user-prompt
echo '{"prompt": "test", "cwd": "/tmp/test"}' | bun run dev hook user-prompt
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `bun run build` to verify
5. Submit a pull request

---

## Credits

- [Honcho](https://honcho.dev) by [Plastic Labs](https://plasticlabs.ai) - The persistent memory API
- [Claude Code](https://claude.ai/code) by [Anthropic](https://anthropic.com) - The AI coding assistant
- Built with [Bun](https://bun.sh) - The fast JavaScript runtime

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Links

- [Honcho Documentation](https://docs.honcho.dev)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [Report Issues](https://github.com/erosika/honcho-claudis/issues)
