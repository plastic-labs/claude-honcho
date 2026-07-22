---
description: Configure Honcho memory plugin settings interactively
allowed-tools: get_config, set_config
user-invocable: true
---

# Honcho Configuration

Interactive configuration for the Honcho memory plugin. Uses AskUserQuestion for all menus and selections — never dump numbered text lists.

## Step 1: Status Header

Call `get_config` to load the current state. The response includes a `card` field — a pre-rendered box-drawing card with perfect alignment.

**Output the `card` value exactly as-is inside a code fence.** Do not modify it, re-render it, or add any formatting. Just wrap it in triple backticks:

````
```
{card value here, verbatim}
```
````
- Do NOT show cache info, config paths, or raw JSON.
- Do NOT show warnings unless they indicate something is broken (skip env var shadowing warnings where the values match what's configured).
- If `configExists` is false, tell the user no config exists and offer to create one.

## Step 2: Menu

Present ONE question with these options (the user can select "Other" to reach advanced settings):

```
AskUserQuestion:
  question: "What would you like to configure?"
  header: "Config"
  options:
    - label: "Peers"
      description: "Your name and AI name (currently: {resolved.peerName} / {resolved.aiPeer})"
    - label: "Session mapping"
      description: "How sessions are named — per directory, git branch, or per chat (currently: {resolved.sessionStrategy})"
    - label: "Workspace"
      description: "Data space and session scope (currently: {resolved.workspace})"
    - label: "Memory injection"
      description: "What Honcho injects at session start and per turn (currently: start [{injection.sessionStart}], turn [{injection.perTurn}])"
```

For the "Memory injection" description, use the *effective* values: if `injection.sessionStart` is unset it is `[]` (nothing), and if `injection.perTurn` is unset it is `["context"]` (conclusions on).

If the user selects "Other", present advanced options:

```
AskUserQuestion:
  question: "Advanced settings:"
  header: "Advanced"
  options:
    - label: "Host"
      description: "Platform / local / custom URL (currently: {current.host})"
    - label: "Context refresh"
      description: "TTL, message threshold, dialectic settings"
    - label: "Message upload"
      description: "Token limits, summarization settings"
    - label: "Statusline"
      description: "Memory statusLine visibility — on / off (currently: {resolved.statusline})"
```

Always include current values in the description so the user can see what's set.

## Step 3: Handle Selection

### Peers

When selected, use `AskUserQuestion` to ask which peer to change:

```
AskUserQuestion:
  question: "Which peer to change?"
  header: "Peers"
  options:
    - label: "Your name"
      description: "Currently: {resolved.peerName}"
    - label: "AI name"
      description: "Currently: {resolved.aiPeer}"
```

Then ask for the new value. Call `set_config` with `peerName` or `aiPeer`.

### Simple fields (Logging, etc.)

Use `AskUserQuestion` to ask for the new value if there are known options, otherwise ask the user to type it. Call `set_config` with the appropriate field. Show the result.

### Session mapping

```
AskUserQuestion:
  question: "Which session mapping strategy?"
  header: "Sessions"
  options:
    - label: "per-directory (Recommended)"
      description: "{peer}-{repo} — one session per project"
    - label: "git-branch"
      description: "{peer}-{repo}-{branch} — session follows branch"
    - label: "chat-instance"
      description: "chat-{id} — fresh each launch"
```

Do NOT use markdown previews for this menu — descriptions are sufficient and previews truncate in narrow terminals.

After strategy selection, ask about peer prefix:

```
AskUserQuestion:
  question: "Include your name in session names?"
  header: "Prefix"
  options:
    - label: "Yes — {peerName}-{repoName}"
      description: "For teams sharing a workspace"
    - label: "No — {repoName} only"
      description: "Cleaner for solo use"
```

### Workspace

When selected, present a sub-menu:

```
AskUserQuestion:
  question: "Workspace settings?"
  header: "Workspace"
  options:
    - label: "Rename workspace"
      description: "Change workspace name (currently: {resolved.workspace})"
```

#### Workspace > Rename

Dangerous field — requires confirmation. First call `set_config` WITHOUT `confirm: true`. The tool will return a description of what will happen. Use `AskUserQuestion` to confirm:

```
AskUserQuestion:
  question: "Switch workspace to '{value}'?"
  header: "Confirm"
  options:
    - label: "Yes, switch"
      description: "Change to the new workspace"
    - label: "Cancel"
      description: "Keep current workspace"
```

If confirmed, call `set_config` again WITH `confirm: true`.

### Memory injection

Ask BOTH questions in a SINGLE `AskUserQuestion` call — two multi-select questions — so the user configures both surfaces at once. This is the only injection prompt; do not add follow-ups.

```
AskUserQuestion (both questions multiSelect: true):
  Q1:
    question: "What should Honcho inject at the start of each session?"
    header: "Session start"
    options:
      - label: "Session summary"
        description: "Rolling long summary of prior sessions"
      - label: "Peer card"
        description: "Your identity + attributes list"
      - label: "Representation"
        description: "Honcho's derived prose profile of you"
  Q2:
    question: "What should Honcho inject on each user turn?"
    header: "Per turn"
    options:
      - label: "Relevant conclusions"
        description: "Fresh, prompt-scoped memory pulled every turn"
```

Map the selections to component names, then call `set_config` once per surface:
- Session start → `injection.sessionStart`, mapping "Session summary"→`summary`, "Peer card"→`peerCard`, "Representation"→`peerRepresentation`.
- Per turn → `injection.perTurn`, mapping "Relevant conclusions"→`context`.

Pass the value as a JSON array (e.g. `["summary","peerCard"]`). An empty selection for a surface means "inject nothing" there — pass `[]`.

Retrieval tuning is intentionally NOT asked here. `injection.searchTopK` (default 10), `injection.maxConclusions` (15), and `injection.searchMaxDistance` (0.4, cosine — lower is stricter) are all configurable via `set_config`, but keep the defaults; only mention they're tunable if the user brings it up, and never prompt for them.

### Dangerous fields (Host)

Host changes require confirmation. First call `set_config` WITHOUT `confirm: true`. The tool will return a description of what will happen. Use `AskUserQuestion` to confirm, then call again WITH `confirm: true`.

### Context refresh

Use `AskUserQuestion` to pick which setting to change:

```
AskUserQuestion:
  question: "Which context refresh setting?"
  header: "Refresh"
  options:
    - label: "TTL"
      description: "Cache lifetime — currently {contextRefresh.ttlSeconds}s (default: 300)"
    - label: "Message threshold"
      description: "Refresh every N messages — currently {contextRefresh.messageThreshold} (default: 30)"
    - label: "Skip dialectic"
      description: "Skip chat() in prompt hook — currently {contextRefresh.skipDialectic} (default: false)"
```

Then ask for the new value and call `set_config`.

### Statusline

```
AskUserQuestion:
  question: "Memory statusLine visibility?"
  header: "Statusline"
  options:
    - label: "on (Recommended)"
      description: "Sync status, clickable session link, and live activity"
    - label: "off"
      description: "Hidden"
```

Call `set_config` with field `statusline` and the chosen value. Takes effect on the next statusLine repaint.

### Message upload

Use `AskUserQuestion` to pick which setting to change:

```
AskUserQuestion:
  question: "Which message upload setting?"
  header: "Upload"
  options:
    - label: "Max user tokens"
      description: "Truncate user messages — currently {messageUpload.maxUserTokens || 'no limit'}"
    - label: "Max assistant tokens"
      description: "Truncate assistant messages — currently {messageUpload.maxAssistantTokens || 'no limit'}"
    - label: "Summarize assistant"
      description: "Use summary instead of full text — currently {messageUpload.summarizeAssistant}"
```

Then ask for the new value and call `set_config`.

## Step 4: Loop

After handling a selection, call `get_config` again to refresh state. Use `AskUserQuestion` to ask if they want to configure more:

```
AskUserQuestion:
  question: "Configuration updated. What next?"
  header: "Next"
  options:
    - label: "Configure more"
      description: "Return to settings menu"
    - label: "Done"
      description: "Exit configuration"
```

If "Configure more", go back to Step 2. If "Done", show the final status header and exit.

## Guardrails

- ALWAYS use AskUserQuestion for menus and confirmations. Never present numbered text lists.
- Always show the result of `set_config` including any cache invalidation that occurred.
- If a warning about env var shadowing is returned, explain that the env var takes precedence at runtime.
- Never guess values — always ask the user.
- Include current values in option descriptions so the user sees what's set without expanding anything.
- If `get_config` returns `configExists: false`, guide the user to set HONCHO_API_KEY first.
