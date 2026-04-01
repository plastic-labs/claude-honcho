# Contributing to Honcho Plugins for Claude Code

Thanks for your interest in contributing! This guide covers the development setup and conventions for both plugins in this repo.

## Project Structure

```text
claude-honcho/
├── .claude-plugin/
│   └── marketplace.json    # Claude Code marketplace manifest
├── plugins/
│   ├── honcho/             # Persistent memory plugin
│   │   ├── src/            # TypeScript source (run directly by Bun)
│   │   ├── hooks/          # Hook entry points (thin wrappers into src/)
│   │   ├── skills/         # Plugin skills (setup, config, status, interview)
│   │   ├── mcp-server.ts   # MCP server entry point
│   │   ├── mcp-servers.json
│   │   ├── scripts/        # install-local.sh / install-local.ps1
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── honcho-dev/         # SDK skills plugin (no compiled code)
│       ├── skills/         # Skills for building with Honcho SDK
│       └── .claude-plugin/
├── assets/
├── CHANGELOG.md
└── README.md
```

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) -- the honcho plugin uses Bun as its runtime (runs TypeScript directly, no build step)
- A Honcho API key from [app.honcho.dev](https://app.honcho.dev)

### Clone and Install

```bash
git clone https://github.com/plastic-labs/claude-honcho.git
cd claude-honcho/plugins/honcho
bun install
```

## Working on the `honcho` Plugin

The honcho plugin provides persistent memory for Claude Code via hooks and an MCP server. Bun runs TypeScript natively, so there is no build step.

### Key Files

- `src/hooks/` -- Hook implementations (session-start, session-end, user-prompt, pre-compact, post-tool-use, stop)
- `src/mcp/server.ts` -- MCP server for memory tools
- `src/config.ts` -- Configuration management
- `src/cache.ts` -- Local caching layer
- `hooks/` -- Thin entry-point wrappers that Bun executes directly (these import from `src/`)
- `skills/` -- Plugin skills (setup wizard, status check, etc.)

### Local Testing

The repo includes install scripts that sync your local source into Claude Code's plugin cache:

```bash
# macOS / Linux
bash scripts/install-local.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install-local.ps1
```

After running, restart Claude Code to pick up changes.

### Making Changes

- **Source** lives in `src/`. No build needed -- Bun runs `.ts` files directly.
- **Hooks** are Claude Code lifecycle hooks. The entry points in `hooks/` are thin wrappers; put logic in `src/hooks/`.
- **Skills** are markdown-based instructions in `skills/`. These don't need compilation.
- **MCP server** provides tools that Claude can call for memory search, context retrieval, etc.

## Working on the `honcho-dev` Plugin

The honcho-dev plugin is skills-only (no code to run). It provides guidance for building apps with the Honcho SDK.

### Key Files

- `skills/integrate/` -- Skill for integrating Honcho into applications
- `skills/migrate-py/` and `skills/migrate-ts/` -- Migration guides for Python and TypeScript

To contribute new skills, create a directory under `plugins/honcho-dev/skills/` with a `SKILL.md` file.

## Code Style

- TypeScript with ESM modules
- Bun as the runtime (not Node.js)
- Prefer async/await over callbacks
- Keep hook entry points thin -- put logic in `src/`

## Submitting Changes

1. Fork the repo and create a feature branch
2. Make your changes and test locally with the install-local script
3. Update `CHANGELOG.md` if your change is user-facing
4. Open a pull request with a clear description of what and why

## Questions?

Open an issue at [github.com/plastic-labs/claude-honcho](https://github.com/plastic-labs/claude-honcho/issues).
