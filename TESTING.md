# Testing Guide — eri/global-honcho-config

How to test the `eri/global-honcho-config` branch before merging to `main`.

## Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- Honcho API key (free at https://app.honcho.dev)
- `HONCHO_API_KEY` exported in shell config

## Install from branch

```bash
# If you have the plugin from main, uninstall first
/plugin uninstall honcho

# Install from the feature branch
/plugin marketplace add plastic-labs/claude-honcho@eri/global-honcho-config
/plugin install honcho@honcho

# Restart Claude Code
```

## Test Matrix

### 1. Fresh install (no prior config)

**Setup:** No `~/.honcho/config.json` exists.

```bash
rm -f ~/.honcho/config.json  # backup first if needed
```

**Steps:**
1. Start Claude Code
2. Verify Honcho logo appears on startup
3. Run `/honcho:setup` — should create config and validate connection
4. Run `/honcho:status` — should show workspace, peers, connection status
5. Run `/honcho:config` — should show interactive menu
6. Send a few messages, exit, start a new session — context should load

**Expected config** (`~/.honcho/config.json`):
```json
{
  "apiKey": "hch-...",
  "peerName": "your-username",
  "hosts": {
    "claude_code": {
      "workspace": "claude_code",
      "aiPeer": "claude"
    }
  }
}
```

---

### 2. Upgrade from main (existing config, no hosts block)

**Setup:** Install from `main` first, use it, then switch to this branch.

Typical pre-upgrade config:
```json
{
  "apiKey": "hch-...",
  "peerName": "eri",
  "workspace": "claude_code"
}
```

**Steps:**
1. Confirm old config has no `hosts` key
2. Switch to this branch, restart Claude Code
3. Verify startup works — legacy fallback reads flat fields
4. Run `/honcho:config` — this triggers migration
5. Check `~/.honcho/config.json` — should now have `hosts` block
6. Verify flat `workspace` and `claudePeer` fields are cleaned up
7. Verify context from previous sessions still loads

**Check:** If you previously used `"clawd"` as your AI peer, run `/honcho:config` and set AI peer to `"clawd"` to maintain continuity with old sessions.

---

### 3. Upgrade with HONCHO_WORKSPACE env var

**Setup:** Old config + `HONCHO_WORKSPACE` set in shell.

```bash
export HONCHO_WORKSPACE="my-custom-workspace"
```

**Steps:**
1. Start Claude Code on this branch
2. Legacy path should resolve workspace from env var
3. Run `/honcho:config` or send messages (triggers `saveConfig`)
4. Check config — `hosts.claude_code.workspace` should be `"my-custom-workspace"`
5. Remove `HONCHO_WORKSPACE` from shell config — value is now persisted in file
6. Restart — workspace should still be `"my-custom-workspace"`

---

### 4. Session strategies

**Steps for each strategy:**

**per-directory** (default):
1. Run `/honcho:config`, set session mapping to "per-directory"
2. Open Claude Code in two different directories
3. Each should have its own Honcho session
4. Messages from dir A should not appear in dir B context

**git-branch**:
1. Set session mapping to "git-branch"
2. Switch git branches, start new Claude Code sessions
3. Each branch should get its own Honcho session

**chat-instance**:
1. Set session mapping to "chat-instance"
2. Start two concurrent Claude Code sessions in the same directory
3. Each should have a unique session (no cross-contamination)

---

### 5. /honcho:setup skill

**Steps:**
1. Run `/honcho:setup`
2. If config exists: should report "Config already exists" and skip creation
3. If no config: should create one with defaults
4. If `HONCHO_API_KEY` is unset: should show instructions and exit

---

### 6. MCP tools

**Steps:**
1. Ask Claude: "What is my current Honcho config?" — should use `get_config`
2. Ask Claude: "Set my AI peer name to clawd" — should use `set_config`
3. Ask Claude: "Search my Honcho memory for X" — should use `search`
4. Ask Claude: "Remember that I prefer bun over npm" — should use `create_conclusion`

---

### 7. Linked hosts (if using multiple tools)

**Setup:** Have both `claude-honcho` and `cursor-honcho` installed.

**Steps:**
1. Run `/honcho:config`, go to linked hosts
2. Link `cursor` (or `claude_code` if testing from cursor side)
3. Check config — `hosts.claude_code.linkedHosts: ["cursor"]`
4. Context from the linked host's workspace should be available

---

### 8. Edge cases

- **Corrupt config:** Manually break `~/.honcho/config.json` with invalid JSON, restart. Should fall back to env vars.
- **Missing API key:** Unset `HONCHO_API_KEY`, restart. Plugin should disable gracefully, no crash.
- **Network timeout:** Disconnect network, start session. Context fetch should fall back to stale cache.
- **Concurrent sessions:** Open 3+ Claude Code windows simultaneously. No instance ID collisions, no duplicate messages.

## Verifying message sync

1. Send several messages in a session
2. Exit Claude Code
3. Start a new session in the same directory
4. Startup context should reference your previous conversation
5. Check that messages are not duplicated (each message appears once)
6. Check that timestamps are correct (not all stamped at session-end time)

## Config file location

```
~/.honcho/config.json    # main config
~/.honcho/cache.json     # session cache (auto-managed)
~/.honcho/logs/          # debug logs (if logging enabled)
```

## Reporting issues

File issues at https://github.com/plastic-labs/claude-honcho/issues with:
- Your config (redact API key)
- Output of `/honcho:status`
- Steps to reproduce
