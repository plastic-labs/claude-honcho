# Changelog

All notable changes to claude-honcho will be documented in this file.

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
