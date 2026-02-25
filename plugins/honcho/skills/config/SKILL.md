---
name: honcho:config
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

Use `AskUserQuestion` with two questions to present the menu. First question selects the category, second selects the specific setting.

Present ONE question with these options:

```
AskUserQuestion:
  question: "What would you like to configure?"
  header: "Config"
  options:
    - label: "Peers"
      description: "Your name and AI name (currently: {resolved.peerName} / {resolved.aiPeer})"
    - label: "Session mapping"
      description: "How sessions are named — per directory, git branch, or per chat (currently: {resolved.sessionStrategy})"
    - label: "Linked hosts"
      description: "Merge context from other tools (currently: {resolved.linkedHosts || 'none'})"
    - label: "Workspace"
      description: "Data space — CAUTION: changes visible data (currently: {resolved.workspace})"
```

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

### Dangerous fields (Workspace, Host)

These require confirmation. First call `set_config` WITHOUT `confirm: true`. The tool will return a description of what will happen. Use `AskUserQuestion` to confirm:

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

### Linked hosts

Linking makes the config **unified** across hosts. All linked hosts share the same workspace, session mapping, and peer names. Context flows between all linked workspaces.

**Step 1: Show current state.** If `resolved.linkedHosts` is non-empty, show what's linked. If `globalOverride` is true, note that config is already unified.

**Step 2: Pick hosts to link.**

```
AskUserQuestion:
  question: "Which hosts should share context?"
  header: "Link"
  multiSelect: true
  options:
    - label: "{hostKey}"
      description: "workspace: {hostWorkspace}"
    (one option per detected host from get_config's host.otherHosts)
```

If the user selects none (or deselects all), disable linking: call `set_config` with `field: "linkedHosts"`, `value: []`, then call `set_config` with `field: "globalOverride"`, `value: false`. Skip remaining steps.

**Step 3: Pick the shared workspace.**

```
AskUserQuestion:
  question: "Which workspace should all linked hosts use?"
  header: "Workspace"
  options:
    - label: "{currentWorkspace} (Recommended)"
      description: "Keep the current workspace for all hosts"
    - label: "{otherHostWorkspace}"
      description: "Use {otherHost}'s workspace instead"
    (one option per unique workspace among linked hosts)
```

Call `set_config` with `field: "workspace"`, `value: chosen`, `confirm: true`.

**Step 4: Session mapping.**

```
AskUserQuestion:
  question: "How should sessions be mapped across all hosts?"
  header: "Sessions"
  options:
    - label: "per-directory (Recommended)"
      description: "{repoName} — one session per project"
    - label: "git-branch"
      description: "{repoName}-{branch} — session follows branch"
    - label: "chat-instance"
      description: "chat-{id} — fresh each launch"
```

Call `set_config` with `field: "sessionStrategy"` and the selection.

Then ask about prefix:

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

Call `set_config` with `field: "sessionPeerPrefix"`.

**Step 5: Enable unified config.**

Call `set_config` with `field: "linkedHosts"` and the selected host array, then call `set_config` with `field: "globalOverride"`, `value: true`, `confirm: true`.

Explain: "Linking is active. Any changes to peers, session mapping, or workspace now apply to all linked hosts. Each host still reads context from its own workspace plus all linked workspaces."

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
