---
description: Configure Honcho memory plugin settings interactively
allowed-tools: get_config, set_config
user-invocable: true
---

# Honcho Configuration

Interactive configuration for the Honcho memory plugin. Lets the user inspect and change connection settings, session behavior, and cache state through a menu-driven flow.

## Step 1: Status Header

Call `get_config` to load the current state. Display a status block:

```
Workspace: {resolved.workspace}
Session:   {current.session} ({resolved.sessionStrategy})
Peer:      {resolved.peerName}
AI peer:   {resolved.aiPeer}
Host:      {current.host}
Linked:    {resolved.linkedHosts} -> {resolved.linkedWorkspaces}
```

If `linkedHosts` is empty, show `Linked: none`. If other hosts are detected in `host.otherHosts`, mention them as available to link.

If `configExists` is false, tell the user no config file exists yet and offer to create one.

If there are `warnings`, display them after the status block.

## Step 2: Menu

Present this menu:

```
What would you like to configure?

Connection
  1. Peer name        -- your name in Honcho
  2. AI peer          -- the AI's name (affects memory retrieval)
  3. Workspace        -- data space (CAUTION: changes visible data)
  4. Host             -- SaaS / local / custom URL

Behavior
  5. Session strategy -- how sessions are created and named
  6. Linked hosts     -- merge context from other tools (cursor, obsidian)
  7. Context refresh  -- TTL, message threshold, dialectic
  8. Message upload   -- token limits, summarization
  9. Logging          -- file logging, enable/disable

 10. Done
```

## Step 3: Handle Selection

### Simple fields (1, 2, 9)

Ask for the new value and call `set_config` with the appropriate field. Show the result.

### Dangerous fields (3, 4)

These require confirmation. First call `set_config` WITHOUT `confirm: true`. The tool will return a description of what will happen. Show this to the user and ask if they want to proceed. If yes, call `set_config` again WITH `confirm: true`.

### Session strategy (5)

Explain the three modes:

- **per-directory** (default): Session = `{peerName}-{repoName}`. Each project directory gets one session.
- **git-branch**: Session = `{peerName}-{repoName}-{branch}`. Switching branches switches context. Each branch maintains its own memory thread.
- **claude-instance**: Session = `claude-{session_id}`. Every Claude launch is a fresh session. No cross-session memory within a workspace.

Also mention: manual overrides in the sessions map always take precedence over any strategy.

Ask which mode they want and call `set_config` with `field: "sessionStrategy"`.

Also show the **peer prefix** setting (`resolved.sessionPeerPrefix`):
- **true** (default): sessions are named `{peerName}-{repoName}` — needed for teams where multiple users share a workspace
- **false**: sessions are named `{repoName}` only — cleaner for solo use

If the user wants to disable the prefix, call `set_config` with `field: "sessionPeerPrefix"` and `value: false`.

### Linked hosts (6)

Show:
- Currently linked hosts (`resolved.linkedHosts`)
- The workspaces being read from (`resolved.linkedWorkspaces`)
- Other detected hosts in the config (`host.otherHosts`)

Explain: linking a host means this plugin will also read context from that host's workspace when building your prompt. Writes (message saves, conclusions) always go to the current workspace only. This lets you have shared memory across tools.

Example: if you use both Claude Code and Cursor on the same project, linking `cursor` means Claude Code can see what Cursor's AI discussed with you.

If other hosts are detected, offer them as options. The user can also type a host key manually (e.g., `obsidian` if they know the obsidian-honcho plugin writes to that key).

Call `set_config` with `field: "linkedHosts"` and `value: ["cursor", "obsidian"]` (array of host keys).

### Context refresh (7)

Show current values and explain:
- **TTL** (`contextRefresh.ttlSeconds`): How long cached context is valid (default: 300s)
- **Message threshold** (`contextRefresh.messageThreshold`): Refresh knowledge graph every N messages (default: 30)
- **Skip dialectic** (`contextRefresh.skipDialectic`): Skip the chat() call in user-prompt hook (default: false)

Ask which to change and call `set_config` for each.

### Message upload (8)

Show current values and explain:
- **Max user tokens** (`messageUpload.maxUserTokens`): Truncate user messages (default: no limit)
- **Max assistant tokens** (`messageUpload.maxAssistantTokens`): Truncate assistant messages (default: no limit)
- **Summarize assistant** (`messageUpload.summarizeAssistant`): Use summary instead of full text (default: false)

Ask which to change and call `set_config` for each.

## Step 4: Loop

After handling a selection, call `get_config` again to refresh the status header, then show the menu again. Continue until the user selects Done.

## Guardrails

- Always show the result of `set_config` including any cache invalidation that occurred.
- If a warning about env var shadowing is returned, explain that the env var takes precedence at runtime.
- Never guess values -- always ask the user.
- If `get_config` returns `configExists: false`, guide the user to set HONCHO_API_KEY first.
