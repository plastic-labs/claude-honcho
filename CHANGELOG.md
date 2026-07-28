# Changelog

All notable changes to claude-honcho will be documented in this file.

## [Unreleased]

## [0.2.9] - 2026-07-28

### Changed

- Per-turn injection's `context` component split into three independently selectable components: `userContext` (the former `context`), `assistantContext` (the same fetch for the AI peer), and `sessionContext` (recent raw messages from the mapped Honcho session via `session.context()`, budget via `injection.sessionContextTokens`). Stored configs using `context` keep working — it resolves to `userContext`.

## [0.2.8] - 2026-07-27

### Added

- `/honcho:import` skill to backfill past Claude Code sessions into Honcho memory.
- Composable, config-driven memory injection — `injection` config block with per-surface component menus (`sessionStart` / `perTurn`) and retrieval tuning (`searchTopK`, `maxConclusions`, `searchMaxDistance`).
- Memory-usage directives now ship automatically as SessionStart context — no more manual CLAUDE.md paste.
- Optional dialectic summary component for the user-prompt hook.
- `honcho_remember` MCP tool for mid-conversation recall (batched questions, configurable reasoning tier) — opt in via the `rememberTool` config flag; session-start directives nudge proactive use when enabled.

### Fixed

- Machine plumbing (runtime `<<...>>` sentinels, `[Session ended]` markers) is no longer attributed to the user peer.
- Batched message uploads no longer replay already-accepted batches after a partial failure.
- SessionEnd hook does nothing beyond logging and state cleanup, so `/exit` can no longer surface "Hook cancelled".

## [0.2.7] - 2026-07-22

### Added

- `saveToolUse` config flag (`HONCHO_SAVE_TOOL_USE` env var) to opt into uploading tool-use messages.

### Changed

- Messages upload live (user prompts on submit, assistant messages from the stop hook) instead of being queued and flushed at session end.

### Fixed

- Stop hook no longer uploads assistant messages when the turn has no preceding user prompt.

## [0.2.6] - 2026-07-21

### Fixed

- MCP `chat` tool no longer times out on long dialectic queries (~80s at max reasoning). Dialectic calls run on a dedicated no-retry Honcho client under a single 120s deadline covering the whole flow, and the plugin's MCP server config sets a 150s per-tool timeout, so the server's clean timeout error always surfaces before the harness aborts the call.

## [0.2.5] - 2026-06-02

### Added

- Memory statusLine — surfaces what Honcho memory is doing on the Claude Code statusLine. Hooks write a per-window activity-state file (`~/.honcho/state-<session>.json`) and a host-managed renderer (`plugins/honcho/scripts/honcho-statusline.sh`) draws sync status, a clickable session link, and a live activity glyph (loading/compacting/recalling/querying). Installed and registered by `/honcho:setup`; toggle on/off via the `statusline` config key, settable through `/honcho:config`.
- First-prompt tool hint — on the first prompt of a session, nudges the harness to actively call the Honcho MCP tools rather than rely only on passive context injection.
- Per-host `apiKey` field in `hosts.<name>` — takes precedence over root `apiKey`, still overridden by `HONCHO_API_KEY` env var. Lets different integrations authenticate against different Honcho orgs from one config file.
- `get_config` now warns when `HONCHO_API_KEY` is set and overrides the `apiKey` in `config.json`, so the active key is never ambiguous.
- Version-update nag: warns on first prompt when the installed plugin is behind the published version (checks for updates at most once a day; silent on failure).
- `scripts/analyze-usage.py` — analyzes Claude Code Honcho usage from `~/.claude` logs.

### Changed

- Skip `cd` commands when logging Bash tool calls

### Fixed

- Spinner degrades gracefully without a TTY — Claude Code >=2.1.139 runs hooks without a controlling terminal, so `/dev/tty` fails; probe for a real terminal and fall back to a single clean line when none is available.
- `sessionStart` hook now runs async (#43).
- Preserve a host-scoped `apiKey` already on disk when rewriting config — no longer drops `hosts.<host>.apiKey` on save.

## [0.2.4] - 2026-04-01

### Added

- `observationMode: "unified" | "directional"` config flag — per-host with root fallback, default `"unified"`
  - **unified** (default): all agents contribute to the user's self-observation collection (`observer=user, observed=user`); conclusions are portable across agents
  - **directional** (opt-in): each AI maintains its own view of the user (`observer=aiPeer, observed=user`); useful for isolated multi-agent workspaces
  - Resolves the ambiguity from issue #22 — prior code was implicitly directional with no user control; peer-call routing in all hooks and MCP tools now branches on this flag
- `get_context` MCP tool — retrieves the full context object (representation + peer card), scoped by observation mode
- `get_representation` MCP tool — lightweight representation string fetch, scoped by observation mode
- `list_conclusions` MCP tool — paginated list of saved conclusions with `id`, `content`, and `createdAt`
- `delete_conclusion` MCP tool — remove a conclusion by ID
- `schedule_dream` MCP tool — trigger background memory consolidation; Honcho merges redundant conclusions and derives higher-level insights
- `search` tool `scope` parameter — `"session"` (default) or `"workspace"` to search across all sessions
- `observationMode` settable via `set_config` and visible in `get_config` output and status card

### Fixed

- `aiPeer` peer config: `observeMe` corrected to `false` — agent peers don't need self-representation; eliminates wasted background reasoning compute
- `addPeers` session config: `aiPeer.observeOthers` is now `false` in unified mode and `true` in directional mode (was unconditionally `true`)

### Changed

- Bump `@honcho-ai/sdk` floor to `^2.1.0` (adds pagination, `getMessage`, `createdAt`/`isActive` on peers/sessions, strict validation)
- Bump `@modelcontextprotocol/sdk` floor to `^1.26.0`

## [0.2.3] - 2026-03-25

### Fixed

- Adding peers to session with config
- Windows compatibility for TTY, setup, and install
- Per-host config ownership, `saveRootField`, SDK client options
- Resilient hook lifecycle: phased session-end, cache-first user-prompt

## [0.2.2] - 2026-03-03

### Fixed

- Fix `chat-instance` session strategy ignoring `sessionPeerPrefix` setting — sessions now correctly prefix with peer name when enabled

## [0.2.1] - 2026-03-02

### Added

- Global `~/.honcho/config.json` with per-host config blocks (Claude Code, Cursor, Obsidian)
- Host auto-detection via environment signals (`HONCHO_HOST`, `CURSOR_PROJECT_DIR`)
- Linked workspaces for cross-host context sharing at runtime
- `/honcho:config` skill with `get_config` and `set_config` MCP tools
- `/honcho:setup` skill for first-time API key validation and config creation
- Multiple session strategies: `per-directory`, `git-branch`, `chat-instance`
- `globalOverride` flag to apply flat config fields across all hosts
- `sessionPeerPrefix` option to prefix session names with peer name

### Fixed

- Stale cache fallback with timeout for context fetch
- Clear stale session overrides when prefix/strategy/peerName changes
- Message sync bugs: dedup uploads, scope instance IDs per-cwd, add createdAt
- Chat-instance strategy ignores stale session overrides
- Respect `HONCHO_WORKSPACE` env var during legacy config migration
- Various config menu UX improvements (single-select link/unlink, granular host toggles)

### Changed

- Extracted `initHook()` for shared hook entry points
- Unified aiPeer defaults across hosts
- Renamed host identifier from `claude-code` to `claude_code`
- Skills synced to marketplace directory where plugin loader reads them

## [0.2.0] - 2026-02-10

### Added

- Visual logging with pixel art banner
- Configurable file logging to `~/.honcho/` (on by default, togglable)
- Session name prefixing with `peerName` (configurable, default on)
- Installation instructions for adding to Claude Code

### Changed

- Removed legacy SDK format support — all code uses Honcho SDK v2.0.0 natively
- Pinned `@honcho-ai/sdk` to `~2.0.0`
- Updated terminology: "facts" renamed to "conclusions" throughout

## [0.1.2] - 2026-02-05

### Added

- Message chunking for large payloads
- Interview skill (`/honcho:interview`) for capturing user preferences
- Plugin validation on install
- Bundled `node_modules` for marketplace distribution

### Fixed

- Full dependencies declared in package.json for plugin portability
- Banner display on session start

## [0.1.1] - 2026-01-30

### Added

- `honcho enable` / `honcho disable` commands
- Developer plugin (`honcho-dev`) with SDK integration and migration skills
- Pure plugin structure for Claude Code marketplace

### Changed

- Renamed from `honcho-claudis` to `claude-honcho`
- Updated to `@honcho-ai/sdk` v2.0.0
- Removed old handoff and setup skills
- Removed hard dependency on Bun for broader portability

## [0.1.0] - 2026-01-05

### Added

- Initial release as `honcho-claudis`
- Persistent memory for Claude Code sessions using Honcho
- Session-start hook with wavy loading animation
- User-prompt-submit hook with dialectic reasoning context
- Assistant-response-stop hook for real-time response capture
- Pre-compact hook for session state preservation
- Cost optimization with configurable context refresh thresholds
- Endpoint switching between SaaS and local Honcho instances
- Git state tracking with inferred feature context
- Activity logging with tail command
- Self-improvement from AI feedback analysis
- Pixel art and colorful wave spinner UI
- Session isolation per working directory
