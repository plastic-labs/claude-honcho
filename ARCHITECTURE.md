> **Purpose**: This document provides a comprehensive technical overview of the Honcho Claude Code plugin for LLMs and developers. It covers data flow, state management, API dependencies, identified issues, and testing strategy.

---

## Table of Contents

1. [Overview](#overview)
2. [How We Use Honcho](#how-we-use-honcho)
3. [State Locations](#state-locations)
4. [Hook Execution Flow](#hook-execution-flow)
5. [API Call Dependencies](#api-call-dependencies)
6. [File I/O Matrix](#file-io-matrix)
7. [Identified Loopholes & Edge Cases](#identified-loopholes--edge-cases)
8. [Testable Boundaries](#testable-boundaries)
9. [Test Suite Structure](#test-suite-structure)
10. [Recommended Fixes](#recommended-fixes)
11. [Manual Testing Commands](#manual-testing-commands)

---

## Overview

Honcho provides persistent memory across Claude Code sessions. It works by:

1. Installing hooks into `~/.claude/settings.json`
2. Intercepting Claude Code lifecycle events (session start/end, user prompts, tool usage)
3. Saving conversation data to Honcho for knowledge extraction
4. Retrieving relevant context from Honcho's memory system

### Core Components

| File | Purpose |
|------|---------|
| `src/cli.ts` | Main CLI entry point, command routing |
| `src/config.ts` | Configuration management, endpoint switching, helpers |
| `src/cache.ts` | All caching logic (IDs, context, message queue, git state) |
| `src/git.ts` | Git state capture and change detection |
| `src/install.ts` | Hook installation to Claude settings |
| `src/hooks/session-start.ts` | Load context from Honcho + local files + git state |
| `src/hooks/session-end.ts` | Save messages, generate summary |
| `src/hooks/post-tool-use.ts` | Track AI actions for self-awareness |
| `src/hooks/user-prompt.ts` | Queue messages, retrieve context |
| `src/hooks/pre-compact.ts` | Inject context before conversation compaction |
| `src/skills/handoff.ts` | Generate research handoff summaries |

---

## How We Use Honcho

This section maps each feature to the specific Honcho API endpoints that power it.

### Feature: Persistent User Memory

**What it does**: Remembers facts about you across sessions (preferences, background, patterns)

**Honcho endpoints used**:
- `workspaces.peers.getOrCreate(workspace, {id: "eri"})` - Create user peer
- `messages.create()` with `peer_id: eri` - Feed user messages for extraction
- `peers.getContext(workspace, eri)` - Retrieve extracted facts & insights

**Data flow**:
```
User prompt → messages.create() → [Honcho extracts facts] → peers.getContext() → injected at startup
```

### Feature: AI Self-Awareness

**What it does**: Claude remembers what it was working on, recent actions, patterns

**Honcho endpoints used**:
- `workspaces.peers.getOrCreate(workspace, {id: "claude"})` - Create AI peer
- `messages.create()` with `peer_id: claude` - Feed AI actions (tool uses)
- `peers.getContext(workspace, claude)` - Retrieve AI's accumulated self-knowledge

**Data flow**:
```
Tool use → messages.create("[Tool] Edited auth.ts") → peers.getContext(claude) → "What Claude Was Working On"
```

### Feature: Session Summaries

**What it does**: "Last time in this project, you were working on X"

**Honcho endpoints used**:
- `workspaces.sessions.getOrCreate(workspace, {id: "honcho-plugin"})` - One session per project dir
- `sessions.summaries(workspace, session)` - Get short/long summaries

**Data flow**:
```
End of session → messages uploaded → [Honcho generates summary] → sessions.summaries() → "Recent Session Summary"
```

### Feature: Dialectic Chat (Intelligent Queries)

**What it does**: Ask Honcho's LLM to synthesize insights about user/AI

**Honcho endpoints used**:
- `peers.chat(workspace, eri, {query: "What is eri working on?", session_id})` - LLM query

**Data flow**:
```
Session start → peers.chat() → "eri is focused on billing components and prefers..." → system prompt
```

### Feature: Observation Model

**What it does**: Control whose knowledge gets updated from which messages

**Honcho endpoints used**:
- `sessions.peers.set(workspace, session, {peer_config})` - Configure observers

**Configuration**:
```typescript
{
  "eri": { "observe": ["eri", "claude"] },  // eri's context updated from both
  "claude": { "observe": ["eri"] }          // claude only learns about eri
}
```

### Feature: Handoff Summary

**What it does**: Generate debugging summary for research handoff

**Honcho endpoints used**:
- `sessions.messages.list(workspace, session, {filters, reverse: true})` - Raw message history
- `sessions.getContext(workspace, session, {limit_to_session: true})` - Session-specific context

**Data flow**:
```
honcho handoff → messages.list() → local analysis (stuck patterns, topics) → markdown summary
```

### Feature: Instance Isolation

**What it does**: Track parallel Claude instances separately

**Implementation**:
- `metadata.instance_id` attached to each message
- `messages.list({filters: {"metadata.instance_id": "abc123"}})` - Filter by instance
- Local cache tracks `instanceId` per message in `message-queue.jsonl`

### Feature: Pre-Compact Context Injection

**What it does**: Re-inject critical context when Claude's context window compacts

**Honcho endpoints used**:
- `peers.getContext()` - Fetch fresh context
- `sessions.summaries()` - Get current summary

**Trigger**: Claude Code's `UserPromptSubmit` hook with compact detection

### Feature: Git State Tracking

**What it does**: Captures git state at session start, detects external changes (branch switches, commits made outside Claude)

**Implementation**:
- `src/git.ts` - Captures branch, commit SHA, dirty files using git commands
- `~/.honcho/git-state.json` - Caches git state per directory
- `detectGitChanges(previous, current)` - Detects branch switches, new commits, file changes

**Data flow**:
```
Session start → captureGitState() → compare to cached state → detect changes → upload as observations
```

**Session metadata enriched with**:
- `git_branch` - Current branch name
- `git_commit` - Current HEAD SHA
- `git_dirty` - Whether working tree has uncommitted changes

**Dialectic queries enhanced**: Queries include branch context (e.g., "They are on branch 'feature-x'")

### Feature: Endpoint Switching (SaaS vs Local)

**What it does**: Switch between Honcho SaaS and local instances

**Commands**:
- `honcho endpoint` - Show current endpoint
- `honcho endpoint saas` - Switch to SaaS (api.honcho.dev)
- `honcho endpoint local` - Switch to local (localhost:8000)
- `honcho endpoint custom <url>` - Use custom URL
- `honcho endpoint test` - Test connection

**Configuration**:
```json
{
  "endpoint": {
    "environment": "production",  // or "local"
    "baseUrl": "https://custom.honcho.dev"  // optional custom URL
  }
}
```

**Init shortcut**: Type `local` as API key during `honcho init` to configure for local instance

### What Happens When (Practical Walkthrough)

#### Starting Claude Code in a project:

```
You: $ claude
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ Claude Code triggers SessionStart hook                             │
│ → honcho hook session-start                                        │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ 1. Read local config (~/.honcho/config.json)                       │
│ 2. Get/create workspace ID (cached or API call)                    │
│ 3. Get/create session ID based on current directory                │
│ 4. Get/create peer IDs (user + claude)                             │
│ 5. Configure observation: claude observes user                     │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ PARALLEL API CALLS (all at once for speed):                        │
│                                                                    │
│ • peers.getContext(user)   → Facts about you                       │
│ • peers.getContext(claude)  → AI's self-knowledge                  │
│ • sessions.summaries()     → What you worked on before             │
│ • peers.chat(user)         → "What does eri care about?"           │
│ • peers.chat(claude)        → "What should I remember?"            │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ OUTPUT: Context block injected into Claude's system prompt         │
│                                                                    │
│ "[Honcho Memory for eri]: Relevant facts: eri prefers tabs..."     │
└────────────────────────────────────────────────────────────────────┘
```

#### During conversation (each message):

```
You: "Fix the bug in auth.ts"
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ Claude Code triggers UserPromptSubmit hook                         │
│ → honcho hook user-prompt                                          │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ 1. Queue message locally (message-queue.jsonl) - FAST              │
│ 2. Fire-and-forget: upload to Honcho (async, don't wait)           │
│ 3. Check if context cache is stale                                 │
│ 4. Return cached context OR fetch fresh                            │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ OUTPUT: Additional context for this prompt                         │
│                                                                    │
│ {"hookSpecificOutput": {"additionalContext": "Insights: ..."}}     │
└────────────────────────────────────────────────────────────────────┘
```

#### When Claude uses a tool (Write, Edit, Bash):

```
Claude: [Uses Edit tool on auth.ts]
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ Claude Code triggers PostToolUse hook                              │
│ → honcho hook post-tool-use                                        │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ 1. Log action to claude-context.md (local file, survives wipes)     │
│    "- [timestamp] Edited auth.ts: 'old...' -> 'new...'"            │
│ 2. Fire-and-forget: upload to Honcho as AI action                  │
└────────────────────────────────────────────────────────────────────┘
```

#### Ending the session:

```
You: ctrl+c (or type /exit)
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ Claude Code triggers SessionEnd hook                               │
│ → honcho hook session-end                                          │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ 1. Process any remaining queued messages                           │
│ 2. Parse Claude's transcript for assistant messages                │
│ 3. Upload assistant messages to Honcho                             │
│ 4. Update claude-context.md with session summary                    │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ Honcho processes all messages → updates knowledge graph            │
│ Next session will have updated context!                            │
└────────────────────────────────────────────────────────────────────┘
```

### Skills

Skills are Claude Code slash commands that run Honcho functionality:

| Skill | Command | What It Does |
|-------|---------|--------------|
| `/honcho-new` | `honcho session new` | Create/connect to named session |
| `/honcho-list` | `honcho session list` | Show all sessions |
| `/honcho-switch` | `honcho session switch` | Switch to different session |
| `/honcho-status` | `honcho status` | Show current memory status |
| `/honcho-clear` | `honcho session clear` | Reset to default session |
| `/honcho-handoff` | `honcho handoff` | Generate debugging summary |

**Note**: Skills are cached at session start. New skills won't appear until you start a fresh Claude session.

---

## State Locations

### Local Files (`~/.honcho/`)

```
~/.honcho/
├── config.json           # User settings (API key, workspace, peer names, endpoint)
│   └── Properties: peerName, apiKey, workspace, claudePeer, sessions{}, saveMessages,
│                   endpoint.{environment, baseUrl}, localContext.{maxEntries}
│
├── cache.json            # Cached Honcho IDs (avoid redundant API calls)
│   └── Properties: workspace.{name, id}, peers.{name: id}, sessions.{cwd: {id, name, updatedAt}}, claudeInstanceId
│
├── context-cache.json    # Pre-fetched context with TTL tracking
│   └── Properties: userContext.{data, fetchedAt}, claudeContext.{data, fetchedAt},
│                   summaries.{data, fetchedAt}, messageCount, lastRefreshMessageCount
│
├── git-state.json        # Git state per directory (for change detection)
│   └── Properties: {[cwd]: {branch, commit, commitMessage, isDirty, dirtyFiles[], timestamp}}
│
├── message-queue.jsonl   # Local message queue for reliability (append-only)
│   └── Format: {content, peerId, cwd, timestamp, uploaded, instanceId}[] (one JSON per line)
│
└── claude-context.md    # AI self-summary (survives context wipes)
    └── Format: Markdown with "## Recent Activity" section, capped at N entries (configurable)
```

### Remote State (Honcho API)

```
Workspace
├── Sessions (one per project directory)
│   ├── Messages[] (conversation history)
│   ├── Summaries (short + long)
│   └── Peers config (observation settings)
│
└── Peers (user + claude)
    ├── Context (explicit facts + deductive insights)
    ├── Peer Cards (profile summary)
    └── Chat (dialectic queries - LLM-powered)
```

### Claude Code Settings (`~/.claude/settings.json`)

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "command": "honcho hook session-start", "timeout": 30000 }] }],
    "SessionEnd": [{ "hooks": [{ "command": "honcho hook session-end", "timeout": 30000 }] }],
    "PostToolUse": [{ "matcher": "Write|Edit|Bash|Task", "hooks": [{ "command": "honcho hook post-tool-use", "timeout": 10000 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "command": "honcho hook user-prompt", "timeout": 15000 }] }],
    "PreCompact": [{ "matcher": "auto|manual", "hooks": [{ "command": "honcho hook pre-compact", "timeout": 20000 }] }]
  }
}
```

---

## Hook Execution Flow

### Session Start (`session-start.ts`)

**Trigger**: Claude Code session begins
**Latency**: ~400ms
**Output**: Context injected into Claude's system prompt

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON from Claude Code
[3] resetMessageCount()             → Write context-cache.json (messageCount=0)
[4] captureGitState(cwd)            → Run git commands (branch, commit, status)
[5] getCachedGitState(cwd)          → Read git-state.json
[6] detectGitChanges(prev, curr)    → Compare states (branch switch? new commits?)
[7] setCachedGitState(cwd)          → Write git-state.json
[8] getCachedWorkspaceId()          → Read cache.json
    ├─► HIT: use cached ID
    └─► MISS: await workspaces.getOrCreate() → Write cache.json
[9] getCachedSessionId()            → Read cache.json
    ├─► HIT: use cached ID + sessions.update(metadata) FIRE-AND-FORGET
    └─► MISS: await sessions.getOrCreate(metadata) → Write cache.json
[10] getCachedPeerId(user/claude)    → Read cache.json
    └─► MISS: await Promise.all(peers.getOrCreate) → Write cache.json
[11] sessions.peers.set()           → FIRE-AND-FORGET (no await)
[12] Upload git changes as observations → FIRE-AND-FORGET (if changes detected)
[13] setSessionForPath()            → Write config.json (if new session)
[14] loadClaudeLocalContext()        → Read claude-context.md (INSTANT)
[15] Promise.allSettled([5 API calls]) → PARALLEL (with git-aware queries):
    ├─► peers.getContext(user)
    ├─► peers.getContext(claude)
    ├─► sessions.summaries()
    ├─► peers.chat(user, {query: "...on branch X..."})
    └─► peers.chat(claude, {query: "...on branch X..."})
[16] setCachedUserContext()         → Write context-cache.json
[17] setCachedClaudeContext()        → Write context-cache.json
[18] displayHonchoStartup()         → Show pixel art banner
[19] console.log(context)           → Output to Claude (includes git state + changes)
[20] process.exit(0)
```

### User Prompt (`user-prompt.ts`)

**Trigger**: User sends a message
**Latency**: ~10-20ms (cached), ~200ms (fresh fetch)
**Output**: JSON with `hookSpecificOutput.additionalContext`

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON from Claude Code
[3] queueMessage()                  → APPEND to message-queue.jsonl (instant backup)
[4] uploadMessageAsync()            → START async upload (will await before exit)
[5] incrementMessageCount()         → Read+Write context-cache.json
[6] shouldSkipContextRetrieval()    → Regex check for trivial prompts
    └─► TRUE: await uploadPromise, process.exit(0)
[7] shouldRefreshKnowledgeGraph()   → Check if threshold reached (every 50 msgs)
[8] getCachedUserContext()          → Read context-cache.json
    ├─► CACHE HIT + FRESH: formatCachedContext() → console.log(JSON)
    └─► CACHE MISS/STALE:
        ├─► await fetchFreshContext() → API call with search_query
        ├─► setCachedUserContext()    → Write context-cache.json
        └─► markKnowledgeGraphRefreshed() → Write context-cache.json
[9] await uploadPromise             → WAIT for upload to complete
[10] process.exit(0)
```

### Post Tool Use (`post-tool-use.ts`)

**Trigger**: After Write, Edit, Bash, or Task tools
**Latency**: ~50-200ms (includes API call)
**Output**: None (logs AI actions)

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON from Claude Code
[3] shouldLogTool()                 → Filter significant tools (skip ls, pwd, cat, etc.)
    └─► FALSE: process.exit(0)
[4] formatToolSummary()             → Pure string formatting
[5] appendClaudeWork()               → Read+Write claude-context.md (capped 50 entries)
[6] await logToHonchoAsync()        → Upload to Honcho with instance_id
[7] process.exit(0)
```

### Session End (`session-end.ts`)

**Trigger**: Claude Code session ends
**Latency**: ~500-1000ms
**Output**: Console log of messages saved

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON (includes transcript_path, reason)
[3] playCooldown()                  → Show exit animation
[4] Get/create workspace, session, peers → cache.json + API calls
[5] parseTranscript()               → Read transcript file from Claude
[6] getQueuedMessages(cwd)          → Read message-queue.jsonl (filtered by cwd)
[7] await messages.create(queued)   → Upload queued user messages (with instance_id)
[8] markMessagesUploaded(cwd)       → Clear only this session's messages
[9] Filter assistant messages from transcript (last 30)
[10] await messages.create(assistant) → Upload assistant messages (with instance_id)
[11] extractWorkItems()             → Regex parse assistant messages
[12] loadClaudeLocalContext()        → Read claude-context.md
[13] generateClaudeSummary()         → Pure function
[14] saveClaudeLocalContext()        → Write claude-context.md (preserves recent activity)
[15] await messages.create([marker]) → Log session end marker
[16] process.exit(0)
```

### Pre-Compact (`pre-compact.ts`)

**Trigger**: Context window about to be summarized (auto or manual compaction)
**Latency**: ~500-1000ms
**Output**: Memory anchor block to preserve in summary

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON (trigger: auto|manual)
[3] spinner.start()                 → Show "anchoring memory" animation (if auto)
[4] Get/create workspace, session, peers → cache.json + API calls
[5] Promise.allSettled([5 API calls]) → PARALLEL (worth the cost at compaction):
    ├─► peers.getContext(user)      → Full user context
    ├─► peers.getContext(claude)     → Full AI context
    ├─► sessions.summaries()        → Session summaries
    ├─► peers.chat(user)            → Fresh dialectic about user
    └─► peers.chat(claude)           → Fresh dialectic about AI
[6] formatMemoryCard()              → Build "HONCHO MEMORY ANCHOR" block
[7] spinner.stop()                  → Show "memory anchored"
[8] console.log(memoryCard)         → Output anchor block (marked with PRESERVE tags)
[9] process.exit(0)
```

**Purpose**: The memory anchor block contains critical facts marked with `(PRESERVE)` tags that should survive conversation summarization.

---

## API Call Dependencies

```
workspaces.getOrCreate(name)
    │
    └──► Returns: { id: string }
         Required by: ALL other API calls

workspaces.sessions.getOrCreate(workspaceId, {id, metadata})
    │
    └──► Returns: { id: string }
         Required by: messages.create, summaries, peers.set

workspaces.peers.getOrCreate(workspaceId, {id})
    │
    └──► Returns: { id: string }
         Required by: peers.getContext, peers.chat, messages (peer_id)

workspaces.sessions.peers.set(workspaceId, sessionId, { [peerId]: config })
    │
    └──► Configures who observes whom
         Fire-and-forget in session-start

workspaces.peers.getContext(workspaceId, peerId, options)
    │
    └──► Returns: { peer_card, representation: {explicit, deductive} }

workspaces.peers.chat(workspaceId, peerId, {query, session_id})
    │
    └──► Returns: { content: string }
         Only used in session-start

workspaces.sessions.summaries(workspaceId, sessionId)
    │
    └──► Returns: { short_summary, long_summary }

workspaces.sessions.messages.create(workspaceId, sessionId, {messages})
    │
    └──► Uploads messages for knowledge extraction
```

---

## File I/O Matrix

| File | Hook | Operation | Blocking? | Race Risk |
|------|------|-----------|-----------|-----------|
| `config.json` | ALL | READ | Yes | Low |
| `config.json` | session-start | WRITE | Yes | **MEDIUM** |
| `cache.json` | ALL | READ | Yes | Low |
| `cache.json` | ALL | WRITE | Yes | **MEDIUM** |
| `context-cache.json` | user-prompt | READ+WRITE | Yes | **HIGH** |
| `context-cache.json` | session-start | WRITE | Yes | Low |
| `git-state.json` | session-start | READ+WRITE | Yes | Low |
| `message-queue.jsonl` | user-prompt | APPEND | Yes | **MEDIUM** |
| `message-queue.jsonl` | session-end | READ+CLEAR | Yes | **MEDIUM** |
| `claude-context.md` | session-start | READ | Yes | Low |
| `claude-context.md` | post-tool-use | READ+WRITE | Yes | **HIGH** |
| `claude-context.md` | session-end | READ+WRITE | Yes | Low |
| `claude-context.md` | pre-compact | NONE | - | - |

---

## Identified Loopholes & Edge Cases

### 🔴 Critical Issues

#### 1. Cache File Race Conditions

**Location**: `cache.ts:66-71` (and similar patterns)

**Problem**: `loadIdCache()` → modify → `saveIdCache()` is not atomic.

```typescript
export function setCachedPeerId(peerName: string, peerId: string): void {
  const cache = loadIdCache();      // READ
  if (!cache.peers) cache.peers = {};
  cache.peers[peerName] = peerId;   // MODIFY
  saveIdCache(cache);               // WRITE - can clobber concurrent writes!
}
```

**Scenario**: Two parallel `post-tool-use` hooks both read cache, modify, and write. Last write wins, first write is lost.

---

#### 2. ~~Message Queue Not Actually Re-Processed~~ ✅ FIXED

**Status**: This issue has been fixed.

**What was fixed**: `session-end.ts` now:
1. Calls `getQueuedMessages(cwd)` to get queued messages for the current session
2. Uploads them via `messages.create()` with proper instance_id
3. Only then calls `markMessagesUploaded(cwd)` to clear

Messages are now properly uploaded as backup if fire-and-forget failed.

---

#### 3. ~~Fire-and-Forget Loses Errors Silently~~ ✅ PARTIALLY FIXED

**Status**: Partially fixed - uploads are now awaited.

**What was fixed**:
- `user-prompt.ts`: Now awaits `uploadPromise` before exit
- `post-tool-use.ts`: Now awaits `logToHonchoAsync()` before exit

**Remaining issue**: Only `sessions.peers.set()` in session-start is still fire-and-forget (but this is acceptable since it's not critical data).

---

#### 4. Stale Cache IDs Never Invalidated

**Location**: `cache.ts:47-53`

**Problem**: IDs are cached forever with no TTL.

```typescript
export function getCachedWorkspaceId(workspaceName: string): string | null {
  const cache = loadIdCache();
  if (cache.workspace?.name === workspaceName) {
    return cache.workspace.id;  // Could be stale!
  }
  return null;
}
```

**Scenario**: User changes workspace name in config. Cached ID still points to old workspace.

---

### 🟡 Medium Issues

#### 5. JSONL Parsing Throws on Any Corrupt Line

**Location**: `cache.ts:217-221`

```typescript
const lines = content.split("\n").filter((line) => line.trim());
return lines.map((line) => JSON.parse(line)).filter((msg) => !msg.uploaded);
```

If any line is corrupt JSON, entire `map()` throws. Queue is lost.

---

#### 6. claude-context.md Rotation Logic Fragile

**Location**: `cache.ts:273-278`

```typescript
const activityStart = lines.findIndex((l) => l.includes("## Recent Activity"));
```

If "## Recent Activity" header is removed, rotation breaks.

---

#### 7. Session Name Collision

**Location**: `session-start.ts:30-31`

```typescript
const dirName = basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
return `project-${dirName}`;
```

`/code/project-foo` and `/code/PROJECT-FOO` map to same session.

---

#### 8. Transcript Path Untrusted

**Location**: `session-end.ts:43-46`

Path comes from Claude Code via stdin. Could be any file on system.

---

### 🟢 Minor Issues

#### 9. Skip Pattern Too Aggressive

**Location**: `user-prompt.ts:27`

```typescript
/^.{1,19}$/, // very short (< 20 chars)
```

"Show me the code" (17 chars) skips context retrieval.

---

#### 10. Token Estimation Inaccurate

**Location**: `config.ts:121-123`

```typescript
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

Very rough estimate. Code and non-English have different ratios.

---

## Testable Boundaries

### Pure Functions (Unit Testable)

| Module | Functions |
|--------|-----------|
| `config.ts` | `estimateTokens()`, `truncateToTokens()` |
| `cache.ts` | `generateClaudeSummary()` |
| `hooks/session-start.ts` | `getSessionName()`, `formatRepresentation()` |
| `hooks/session-end.ts` | `parseTranscript()`, `extractWorkItems()` |
| `hooks/post-tool-use.ts` | `shouldLogTool()`, `formatToolSummary()` |
| `hooks/user-prompt.ts` | `shouldSkipContextRetrieval()`, `formatCachedContext()` |

### Side Effects to Mock

| Dependency | Mock Strategy |
|------------|---------------|
| `fs.*` | Mock all read/write operations |
| `Bun.stdin.text()` | Return test JSON payloads |
| `Honcho` client | Mock all API methods |
| `Date.now()` | Control time for TTL testing |
| `process.exit()` | Capture exit codes |
| `console.log/error` | Capture outputs |

---

## Test Suite Structure

```typescript
describe('honcho', () => {
  
  describe('Unit: Pure Functions', () => {
    test('estimateTokens() approximates correctly')
    test('truncateToTokens() truncates with ellipsis')
    test('getSessionName() normalizes directory names')
    test('formatRepresentation() handles missing fields')
    test('shouldLogTool() filters trivial commands')
    test('shouldSkipContextRetrieval() matches patterns')
    test('extractWorkItems() finds action patterns')
    test('generateClaudeSummary() creates valid markdown')
  })

  describe('Unit: Cache Operations (mocked fs)', () => {
    test('loadIdCache() returns {} for missing file')
    test('loadIdCache() handles corrupt JSON gracefully')
    test('saveIdCache() creates directory if missing')
    test('getCachedEriContext() returns null when stale')
    test('queueMessage() appends JSONL correctly')
    test('getQueuedMessages() filters uploaded messages')
    test('getQueuedMessages() handles corrupt lines gracefully')
    test('appendClaudeWork() caps at 50 entries')
  })

  describe('Integration: Hook Data Flow (mocked Honcho)', () => {
    test('session-start populates all caches')
    test('session-start uses cached IDs on second run')
    test('session-start outputs context to stdout')
    test('user-prompt queues message before API call')
    test('user-prompt uses cache when fresh')
    test('user-prompt fetches fresh when stale')
    test('user-prompt skips context for trivial prompts')
    test('post-tool-use appends to claude-context.md')
    test('post-tool-use skips trivial bash commands')
    test('session-end clears message queue')
    test('session-end saves assistant messages')
    test('session-end generates claude summary')
  })

  describe('Integration: Error Handling', () => {
    test('session-start recovers from API failure')
    test('user-prompt continues without context on error')
    test('post-tool-use exits cleanly on fire-and-forget failure')
    test('session-end handles missing transcript')
    test('session-end handles corrupt transcript')
  })

  describe('Edge Cases', () => {
    test('concurrent hooks do not corrupt cache files')
    test('stale workspace ID triggers re-fetch')
    test('corrupt JSONL queue is handled gracefully')
    test('empty prompt is skipped')
    test('very long prompt is truncated for search')
    test('directory name collision handled correctly')
  })

  describe('End-to-End (real Honcho, temp directory)', () => {
    test('full session lifecycle saves and retrieves context')
    test('context survives between sessions')
    test('message queue persists through simulated crash')
  })
})
```

### Mock Templates

```typescript
// test/mocks.ts

export const mockHonchoClient = {
  workspaces: {
    getOrCreate: jest.fn().mockResolvedValue({ id: 'ws-123' }),
    sessions: {
      getOrCreate: jest.fn().mockResolvedValue({ id: 'sess-456' }),
      summaries: jest.fn().mockResolvedValue({ 
        short_summary: { content: 'test summary' } 
      }),
      messages: {
        create: jest.fn().mockResolvedValue({}),
      },
      peers: {
        set: jest.fn().mockResolvedValue({}),
      },
    },
    peers: {
      getOrCreate: jest.fn().mockResolvedValue({ id: 'peer-789' }),
      getContext: jest.fn().mockResolvedValue({
        peer_card: ['test card'],
        representation: {
          explicit: [{ content: 'fact 1' }],
          deductive: [{ conclusion: 'insight 1', premises: [] }],
        },
      }),
      chat: jest.fn().mockResolvedValue({ content: 'dialectic response' }),
    },
  },
};

export const mockFs = {
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
  mkdirSync: jest.fn(),
};

export const mockStdin = (input: object) => {
  jest.spyOn(Bun.stdin, 'text').mockResolvedValue(JSON.stringify(input));
};

export const mockConfig = (overrides = {}) => ({
  peerName: 'test-user',
  apiKey: 'test-key',
  workspace: 'test-workspace',
  claudePeer: 'claude',
  saveMessages: true,
  ...overrides,
});
```

## Manual Testing Commands

```bash
# Test session-start hook
echo '{"cwd": "/tmp/test"}' | bun run dev hook session-start

# Test user-prompt hook
echo '{"prompt": "hello world", "cwd": "/tmp/test"}' | bun run dev hook user-prompt

# Test post-tool-use hook
echo '{"tool_name": "Write", "tool_input": {"file_path": "test.txt"}, "cwd": "/tmp/test"}' | bun run dev hook post-tool-use

# Test session-end hook
echo '{"cwd": "/tmp/test", "reason": "user_exit"}' | bun run dev hook session-end

# Clear all caches for fresh testing
rm ~/.honcho/cache.json
rm ~/.honcho/context-cache.json
rm ~/.honcho/message-queue.jsonl

# View current cache state
cat ~/.honcho/cache.json | jq
cat ~/.honcho/context-cache.json | jq
cat ~/.honcho/message-queue.jsonl

# Check hook installation
cat ~/.claude/settings.json | jq '.hooks'
```

---

## Key Insights for LLMs

1. **Hook execution is ephemeral**: Each hook spawns a new process, reads state from files, does work, writes state, exits. No in-memory state persists.

2. **Two caching layers**: ID cache (`cache.json`) for API object IDs, context cache (`context-cache.json`) for actual context data with TTL.

3. **Message reliability pattern**: Queue locally first (instant, survives crashes), start async upload, await before exit, reconcile on session-end.

4. **Dual peer model**: User peer observes self (builds knowledge about user), claude peer observes user (builds AI self-awareness).

5. **Instance isolation**: Parallel Claude sessions in the same directory are tracked via `instance_id` in message metadata.

6. **Pre-compact strategy**: When context window fills, inject a "memory anchor" block with PRESERVE tags to survive summarization.

7. **Remaining risk**: Cache file race conditions can still lose data under concurrent hook access (non-atomic read-modify-write).

---

*Last updated: January 2026*

