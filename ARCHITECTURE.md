# honcho-clawd: Deep Architecture Analysis

> **Purpose**: This document provides a comprehensive technical overview of honcho-clawd for LLMs and developers. It covers data flow, state management, API dependencies, identified issues, and testing strategy.

---

## Table of Contents

1. [Overview](#overview)
2. [State Locations](#state-locations)
3. [Hook Execution Flow](#hook-execution-flow)
4. [API Call Dependencies](#api-call-dependencies)
5. [File I/O Matrix](#file-io-matrix)
6. [Identified Loopholes & Edge Cases](#identified-loopholes--edge-cases)
7. [Testable Boundaries](#testable-boundaries)
8. [Test Suite Structure](#test-suite-structure)
9. [Recommended Fixes](#recommended-fixes)
10. [Manual Testing Commands](#manual-testing-commands)

---

## Overview

**honcho-clawd** is a Claude Code plugin that provides persistent memory across sessions using the Honcho API. It works by:

1. Installing hooks into `~/.claude/settings.json`
2. Intercepting Claude Code lifecycle events (session start/end, user prompts, tool usage)
3. Saving conversation data to Honcho for knowledge extraction
4. Retrieving relevant context from Honcho's memory system

### Core Components

| File | Purpose |
|------|---------|
| `src/cli.ts` | Main CLI entry point, command routing |
| `src/config.ts` | Configuration management, helpers |
| `src/cache.ts` | All caching logic (IDs, context, message queue) |
| `src/install.ts` | Hook installation to Claude settings |
| `src/hooks/session-start.ts` | Load context from Honcho + local files |
| `src/hooks/session-end.ts` | Save messages, generate summary |
| `src/hooks/post-tool-use.ts` | Track AI actions for self-awareness |
| `src/hooks/user-prompt.ts` | Queue messages, retrieve context |

---

## State Locations

### Local Files (`~/.honcho-clawd/`)

```
~/.honcho-clawd/
├── config.json           # User settings (API key, workspace, peer names)
│   └── Properties: peerName, apiKey, workspace, claudePeer, sessions{}, saveMessages
│
├── cache.json            # Cached Honcho IDs (avoid redundant API calls)
│   └── Properties: workspace.{name, id}, peers.{name: id}, sessions.{cwd: {id, name}}
│
├── context-cache.json    # Pre-fetched context with TTL tracking
│   └── Properties: eriContext.{data, fetchedAt}, clawdContext.{data, fetchedAt},
│                   messageCount, lastRefreshMessageCount
│
├── message-queue.jsonl   # Local message queue for reliability (append-only)
│   └── Format: {content, peerId, cwd, timestamp, uploaded}[] (one JSON per line)
│
└── clawd-context.md    # AI self-summary (survives context wipes)
    └── Format: Markdown with "## Recent Activity" section, capped at 50 entries
```

### Remote State (Honcho API)

```
Workspace
├── Sessions (one per project directory)
│   ├── Messages[] (conversation history)
│   ├── Summaries (short + long)
│   └── Peers config (observation settings)
│
└── Peers (user + clawd)
    ├── Context (explicit facts + deductive insights)
    ├── Peer Cards (profile summary)
    └── Chat (dialectic queries - LLM-powered)
```

### Claude Code Settings (`~/.claude/settings.json`)

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "command": "honcho-clawd hook session-start" }] }],
    "SessionEnd": [{ "hooks": [{ "command": "honcho-clawd hook session-end" }] }],
    "PostToolUse": [{ "matcher": "Write|Edit|Bash|Task", "hooks": [...] }],
    "UserPromptSubmit": [{ "hooks": [...] }]
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
[4] getCachedWorkspaceId()          → Read cache.json
    ├─► HIT: use cached ID
    └─► MISS: await workspaces.getOrCreate() → Write cache.json
[5] getCachedSessionId()            → Read cache.json
    ├─► HIT: use cached ID
    └─► MISS: await sessions.getOrCreate() → Write cache.json
[6] getCachedPeerId(user/clawd)   → Read cache.json
    └─► MISS: await Promise.all(peers.getOrCreate) → Write cache.json
[7] sessions.peers.set()            → FIRE-AND-FORGET (no await)
[8] setSessionForPath()             → Write config.json (if new session)
[9] loadClaudisLocalContext()       → Read clawd-context.md (INSTANT)
[10] Promise.allSettled([5 API calls]) → PARALLEL:
    ├─► peers.getContext(user)
    ├─► peers.getContext(clawd)
    ├─► sessions.summaries()
    ├─► peers.chat(user)        # $0.03 per call
    └─► peers.chat(clawd)     # $0.03 per call
[11] setCachedEriContext()          → Write context-cache.json
[12] setCachedClaudisContext()      → Write context-cache.json
[13] console.log(context)           → Output to Claude
[14] process.exit(0)
```

### User Prompt (`user-prompt.ts`)

**Trigger**: User sends a message  
**Latency**: ~10-20ms (cached), ~200ms (fresh fetch)  
**Output**: JSON with `hookSpecificOutput.additionalContext`

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON from Claude Code
[3] shouldSkipContextRetrieval()    → Regex check for trivial prompts
    └─► TRUE: process.exit(0)
[4] queueMessage()                  → APPEND to message-queue.jsonl (~1-3ms)
[5] uploadMessageAsync()            → FIRE-AND-FORGET (Promise not awaited)
[6] incrementMessageCount()         → Read+Write context-cache.json
[7] shouldRefreshKnowledgeGraph()   → Read context-cache.json
[8] getCachedEriContext()           → Read context-cache.json
    ├─► CACHE HIT + FRESH: formatCachedContext() → console.log(JSON)
    └─► CACHE MISS/STALE:
        ├─► await fetchFreshContext() → API call
        ├─► setCachedEriContext()     → Write context-cache.json
        └─► markKnowledgeGraphRefreshed() → Write context-cache.json
[9] process.exit(0)
```

### Post Tool Use (`post-tool-use.ts`)

**Trigger**: After Write, Edit, Bash, or Task tools  
**Latency**: ~5ms  
**Output**: None (fire-and-forget logging)

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON from Claude Code
[3] shouldLogTool()                 → Filter significant tools
    └─► FALSE: process.exit(0)
[4] formatToolSummary()             → Pure string formatting
[5] appendClaudisWork()             → Read+Write clawd-context.md (capped 50)
[6] logToHonchoAsync()              → FIRE-AND-FORGET
[7] process.exit(0)
```

### Session End (`session-end.ts`)

**Trigger**: Claude Code session ends  
**Latency**: ~500ms  
**Output**: Console log of messages saved

```
[1] loadConfig()                    → Read config.json
[2] Bun.stdin.text()                → Parse JSON (includes transcript_path)
[3] Get/create workspace, session, peers → cache.json + API calls
[4] parseTranscript()               → Read transcript file from Claude
[5] getQueuedMessages()             → Read message-queue.jsonl
    └─► markMessagesUploaded()      → Clear message-queue.jsonl
[6] Filter assistant messages from transcript
[7] await messages.create(assistant) → API call (BLOCKING)
[8] extractWorkItems()              → Regex parse assistant messages
[9] loadClaudisLocalContext()       → Read clawd-context.md
[10] generateClaudisSummary()       → Pure function
[11] saveClaudisLocalContext()      → Write clawd-context.md
[12] await messages.create([marker]) → API call
[13] process.exit(0)
```

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
         Cost: FREE (pre-computed)

workspaces.peers.chat(workspaceId, peerId, {query, session_id})
    │
    └──► Returns: { content: string }
         Cost: $0.03 per call (LLM invocation)
         Only used in session-start

workspaces.sessions.summaries(workspaceId, sessionId)
    │
    └──► Returns: { short_summary, long_summary }

workspaces.sessions.messages.create(workspaceId, sessionId, {messages})
    │
    └──► Uploads messages for knowledge extraction
         Cost: $0.001 per message
```

---

## File I/O Matrix

| File | Hook | Operation | Blocking? | Race Risk |
|------|------|-----------|-----------|-----------|
| `config.json` | ALL | READ | Yes | Low |
| `config.json` | session-start | WRITE | Yes | **MEDIUM** |
| `cache.json` | ALL | READ | Yes | Low |
| `cache.json` | session-start | WRITE | Yes | **MEDIUM** |
| `context-cache.json` | user-prompt | READ+WRITE | Yes | **HIGH** |
| `context-cache.json` | session-start | WRITE | Yes | Low |
| `message-queue.jsonl` | user-prompt | APPEND | Yes | **MEDIUM** |
| `message-queue.jsonl` | session-end | READ+CLEAR | Yes | **MEDIUM** |
| `clawd-context.md` | session-start | READ | Yes | Low |
| `clawd-context.md` | post-tool-use | READ+WRITE | Yes | **HIGH** |
| `clawd-context.md` | session-end | READ+WRITE | Yes | Low |

---

## Identified Loopholes & Edge Cases

### 🔴 Critical Issues

#### 1. Cache File Race Conditions

**Location**: `cache.ts:65-70` (and similar patterns)

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

#### 2. Message Queue Not Actually Re-Processed

**Location**: `session-end.ts:186-189`

**Problem**: Queued messages are never re-uploaded on session end.

```typescript
const queuedMessages = getQueuedMessages();
if (queuedMessages.length > 0) {
  markMessagesUploaded();  // Just clears the file!
}
```

If `uploadMessageAsync()` fails (network error), messages are lost forever.

---

#### 3. Fire-and-Forget Loses Errors Silently

**Locations**:
- `session-start.ts:136-143`: `sessions.peers.set().catch(() => {})`
- `user-prompt.ts:77`: `uploadMessageAsync().catch(() => {})`
- `post-tool-use.ts:103`: `logToHonchoAsync().catch(() => {})`

**Problem**: No logging, no retry, no visibility into failures.

---

#### 4. Stale Cache IDs Never Invalidated

**Location**: `cache.ts:46-52`

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

#### 6. clawd-context.md Rotation Logic Fragile

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
| `cache.ts` | `generateClaudisSummary()` |
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
describe('honcho-clawd', () => {
  
  describe('Unit: Pure Functions', () => {
    test('estimateTokens() approximates correctly')
    test('truncateToTokens() truncates with ellipsis')
    test('getSessionName() normalizes directory names')
    test('formatRepresentation() handles missing fields')
    test('shouldLogTool() filters trivial commands')
    test('shouldSkipContextRetrieval() matches patterns')
    test('extractWorkItems() finds action patterns')
    test('generateClaudisSummary() creates valid markdown')
  })

  describe('Unit: Cache Operations (mocked fs)', () => {
    test('loadIdCache() returns {} for missing file')
    test('loadIdCache() handles corrupt JSON gracefully')
    test('saveIdCache() creates directory if missing')
    test('getCachedEriContext() returns null when stale')
    test('queueMessage() appends JSONL correctly')
    test('getQueuedMessages() filters uploaded messages')
    test('getQueuedMessages() handles corrupt lines gracefully')
    test('appendClaudisWork() caps at 50 entries')
  })

  describe('Integration: Hook Data Flow (mocked Honcho)', () => {
    test('session-start populates all caches')
    test('session-start uses cached IDs on second run')
    test('session-start outputs context to stdout')
    test('user-prompt queues message before API call')
    test('user-prompt uses cache when fresh')
    test('user-prompt fetches fresh when stale')
    test('user-prompt skips context for trivial prompts')
    test('post-tool-use appends to clawd-context.md')
    test('post-tool-use skips trivial bash commands')
    test('session-end clears message queue')
    test('session-end saves assistant messages')
    test('session-end generates clawd summary')
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
  claudePeer: 'clawd',
  saveMessages: true,
  ...overrides,
});
```

---

## Recommended Fixes

| Issue | Severity | Recommended Fix |
|-------|----------|-----------------|
| Cache race conditions | 🔴 Critical | Use file locking (`proper-lockfile`) or atomic writes (write to temp, then rename) |
| Queue not re-uploaded | 🔴 Critical | Actually process queue in session-end with retry logic |
| Fire-and-forget silent | 🔴 Critical | Add failure counter to context-cache, log to debug file |
| Stale cache IDs | 🟡 Medium | Add TTL to ID cache (e.g., 24 hours) |
| JSONL parsing throws | 🟡 Medium | Wrap each line parse in try/catch, log corrupt lines |
| Context file fragile | 🟡 Medium | Use structured JSON instead of markdown parsing |
| Session name collision | 🟡 Medium | Include parent directory hash in session name |
| Transcript path trust | 🟡 Medium | Validate path is under Claude's data directory |

---

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
rm ~/.honcho-clawd/cache.json
rm ~/.honcho-clawd/context-cache.json
rm ~/.honcho-clawd/message-queue.jsonl

# View current cache state
cat ~/.honcho-clawd/cache.json | jq
cat ~/.honcho-clawd/context-cache.json | jq
cat ~/.honcho-clawd/message-queue.jsonl

# Check hook installation
cat ~/.claude/settings.json | jq '.hooks'
```

---

## Key Insights for LLMs

1. **Hook execution is ephemeral**: Each hook spawns a new process, reads state from files, does work, writes state, exits. No in-memory state persists.

2. **Two caching layers**: ID cache (`cache.json`) for API object IDs, context cache (`context-cache.json`) for actual context data with TTL.

3. **Message reliability pattern**: Queue locally first (fast, survives crashes), fire-and-forget upload (async), batch reconciliation on session-end.

4. **Dual peer model**: User peer observes self (builds knowledge about user), clawd peer observes user (builds AI self-awareness).

5. **Cost optimization**: `getContext()` is free, `chat()` costs $0.03. Only use `chat()` at session-start, use cached/free APIs during session.

6. **Critical bug**: Message queue is cleared but not re-processed. Failed uploads are silently lost.

7. **Race condition**: All cache read-modify-write patterns can lose data under concurrent access.

---

*Last updated: January 2026*

