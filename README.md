# honcho-claude-code-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![Honcho](https://img.shields.io/badge/Honcho-Memory%20API-blue)](https://honcho.dev)

**Persistent memory for Claude Code sessions using [Honcho](https://honcho.dev) by Plastic Labs.**

Give Claude Code long-term memory that survives context wipes, session restarts, and even `ctrl+c` interruptions. Built on Honcho's memory framework for rich, semantic understanding.

## Features

- **Persistent Memory**: User messages and AI responses are saved to Honcho, building long-term context
- **Survives Interruptions**: Local message queue ensures no data loss on `ctrl+c` or crashes
- **AI Self-Awareness**: Claude knows what it was working on, even after context is wiped
- **Git State Tracking**: Detects branch switches, commits, and changes made outside Claude sessions
- **Dual Peer System**: Separate memory for user (you) and AI
- **Semantic Search**: Relevant context is retrieved based on your current prompt
- **Cost-Optimized**: Configurable refresh rates and caching to minimize API costs
- **Ultra-Fast Hooks**: 98% latency reduction through caching, parallelization, and fire-and-forget patterns
- **Per-Directory Sessions**: Each project directory maintains its own conversation history
- **SaaS/Local Switching**: Easily switch between Honcho SaaS and local instances
- **Claude Code Skills**: Built-in slash commands for session management

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Endpoint Switching](#endpoint-switching)
- [Git State Tracking](#git-state-tracking)
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
git clone https://github.com/plastic-labs/honcho-claude-code-plugin.git
cd honcho-claude-code-plugin

# Install dependencies
bun install

# Build
bun run build

# Install globally
bun link
```

### Install from npm (coming soon)

```bash
bun install -g honcho-claude-code-plugin
```

---

## Quick Start

### 1. Initialize Configuration

```bash
honcho init
```

You'll be prompted for:
- **Your name/peer ID**: How Honcho identifies you (e.g., "yourname")
- **Workspace name**: Your Honcho workspace (e.g., "myworkspace")
- **Claude's peer name**: AI identity in Honcho (default: "claude")
- **Enable message saving**: Whether to save conversation history
- **Honcho API key**: Get from https://app.honcho.dev

### 2. Install Hooks

```bash
honcho install
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
┌────────────────────────────────────────────────────────────────────┐
│                        Claude Code                                 │
├────────────────────────────────────────────────────────────────────┤
│  SessionStart     │  UserPrompt      │  PostToolUse   │ SessionEnd │
│  ─────────────    │  ───────────     │  ────────────  │  ────────  │
│  Load context     │  Queue message   │  Log tool use  │  Batch     │
│  from Honcho +    │  locally (1ms)   │  locally (2ms) │  upload    │
│  local claude     │  Fire-and-forget │  Fire-and-     │  messages  │
│  summary          │  upload          │  forget upload │  Generate  │
│                   │  Cached context  │                │  summary   │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Honcho API                              │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │Workspace  │  │ Session  │  │    Peers     │  │  Messages   │ │
│  │(workspace)│──│(project) │──│ user/claude  │──│ (history)   │ │
│  └───────────┘  └──────────┘  └──────────────┘  └─────────────┘ │
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

The plugin creates two "peers" in Honcho:

| Peer | Represents | Observes | Purpose |
|------|------------|----------|---------|
| `user` (you) | The user | Self | Build knowledge about your preferences, projects, style |
| `claude` | Claude AI | You | Build knowledge about what Claude has done, AI self-awareness |

This enables Claude to understand both what **you** know/want and what **it** has been working on.

---

## Configuration

### Config File

Located at `~/.honcho/config.json`:

```json
{
  "peerName": "yourname",
  "apiKey": "hch-v2-...",
  "workspace": "myworkspace",
  "claudePeer": "claude",
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
| `workspace` | Honcho workspace name | `"claude_code"` |
| `claudePeer` | AI identity in Honcho | `"claude"` |
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

### Endpoint Options

| Option | Description | Default |
|--------|-------------|---------|
| `endpoint.environment` | `"production"` (SaaS) or `"local"` | `"production"` |
| `endpoint.baseUrl` | Custom URL (overrides environment) | `null` |

### Local Context Options

| Option | Description | Default |
|--------|-------------|---------|
| `localContext.maxEntries` | Max entries in claude-context.md | `50` |

---

## Endpoint Switching

Switch between Honcho SaaS and local instances for development/testing.

### Commands

```bash
# Show current endpoint
honcho endpoint

# Switch to SaaS (default)
honcho endpoint saas

# Switch to local instance (localhost:8000)
honcho endpoint local

# Use custom URL
honcho endpoint custom https://my-honcho.example.com

# Test connection
honcho endpoint test
```

### During Init

Type `local` as the API key during `honcho init` to configure for a local instance:

```bash
$ honcho init
Enter your Honcho API key: local
Local mode enabled
Enter local API key (or press enter for 'local'):
```

---

## Git State Tracking

The plugin automatically tracks git state to detect external changes.

### What's Tracked

- **Branch**: Current branch name
- **Commit**: HEAD SHA and message
- **Dirty Files**: Uncommitted changes

### External Change Detection

At each session start, the plugin compares the current git state to the cached state from the last session. Detected changes include:

| Change Type | Example |
|-------------|---------|
| Branch switch | `Branch switched from 'main' to 'feature-x'` |
| New commits | `New commit: abc123 - feat: add feature` |
| Uncommitted changes | `Uncommitted changes detected: file1.ts, file2.ts` |

### Context Enhancement

Git state enhances the startup context:

```
## Honcho Memory System Active
- User: yourname
- AI: claude
- Workspace: myworkspace
- Session: my-project
- Directory: /path/to/project
- Git Branch: feature-x
- Git HEAD: abc123
- Working Tree: 3 uncommitted changes

## Git Activity Since Last Session
- Branch switched from 'main' to 'feature-x'
- New commit: abc123 - feat: add feature
```

Dialectic queries are also enhanced with git context for more relevant responses.

---

## Claude Code Skills

This plugin includes slash commands you can use directly in Claude Code:

### Available Commands

| Command | Description |
|---------|-------------|
| `/honcho-new [name]` | Create or connect to a Honcho session |
| `/honcho-list` | List all Honcho sessions |
| `/honcho-status` | Show current session and memory status |
| `/honcho-switch <name>` | Switch to a different session |
| `/honcho-clear` | Clear custom session (revert to default) |

### Usage Example

```
You: /honcho-status

Claude: Current Honcho session status:
- Workspace: myworkspace
- Session: my-project
- User Peer: yourname
- AI Peer: claude
- Message Saving: enabled
```

---

## Architecture

### File Structure

```
~/.honcho/
├── config.json           # User settings (API key, workspace, peer names, endpoint)
├── cache.json            # Cached Honcho IDs (workspace, session, peers)
├── context-cache.json    # Pre-warmed context with TTL tracking
├── git-state.json        # Git state per directory (for change detection)
├── message-queue.jsonl   # Local message queue (reliability layer)
└── claude-context.md     # AI self-summary (survives context wipes)
```

### Source Structure

```
src/
├── cli.ts              # Main CLI entry point
├── config.ts           # Config management, endpoint switching, helpers
├── cache.ts            # Caching layer (IDs, context, message queue, git state)
├── git.ts              # Git state capture and change detection
├── install.ts          # Hook installation to Claude settings
├── spinner.ts          # Loading animation
├── skills/
│   └── handoff.ts      # Research handoff summary generation
└── hooks/
    ├── session-start.ts    # Load context from Honcho + local + git state
    ├── session-end.ts      # Save messages + generate summary
    ├── post-tool-use.ts    # Log tool usage + update local context
    ├── user-prompt.ts      # Queue message + retrieve context
    └── pre-compact.ts      # Re-inject context before compaction
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

This plugin allows Claude to retain **self-context** - a persistent record of Claude's work that survives context wipes.

### How It Works

1. **PostToolUse**: Every significant action (file writes, edits, commands) is logged to `~/.honcho/claude-context.md`
2. **SessionEnd**: A summary of Claude's work is generated and saved to Honcho
3. **SessionStart**: Claude receives both:
   - **Local context**: Instant read from `claude-context.md`
   - **Honcho context**: Observations and patterns from Honcho's memory system

### Example

After a context wipe, Claude still knows:

```markdown
## Local Context (What I Was Working On)

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
honcho <command>

Commands:
  init        Configure honcho (name, API key, workspace)
  install     Install hooks to ~/.claude/settings.json
  uninstall   Remove hooks from Claude settings
  update      Rebuild and reinstall (removes lockfile, builds, links)
  status      Show current configuration and hook status
  help        Show help message

Session Commands:
  session new [name]     Create/connect Honcho session (defaults to dir name)
  session list           List all sessions
  session current        Show current session info
  session switch <name>  Switch to existing session
  session clear          Remove custom session mapping

Endpoint Commands:
  endpoint               Show current endpoint (SaaS/local)
  endpoint saas          Switch to SaaS (api.honcho.dev)
  endpoint local         Switch to local (localhost:8000)
  endpoint custom <url>  Use custom URL
  endpoint test          Test connection

Skills:
  handoff                Generate research handoff summary
  handoff --all          Include all instances (not just current)

Hook Commands (internal - called by Claude Code):
  hook session-start    Handle SessionStart event
  hook session-end      Handle SessionEnd event
  hook post-tool-use    Handle PostToolUse event
  hook user-prompt      Handle UserPromptSubmit event
  hook pre-compact      Handle PreCompact event
```

---

## Troubleshooting

### Hooks Not Working

1. Check hooks are installed:
   ```bash
   honcho status
   ```

2. Verify `~/.claude/settings.json` contains honcho hooks

3. Check the hook binary is accessible:
   ```bash
   which honcho
   ```

### Slow Performance

1. Clear stale caches:
   ```bash
   rm ~/.honcho/cache.json
   rm ~/.honcho/context-cache.json
   ```

2. First request after cache clear will be slower (populating cache)

### No Context Loading

1. Verify API key is valid in `~/.honcho/config.json`
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
- [Report Issues](https://github.com/plastic-labs/honcho-claude-code-plugin/issues)
