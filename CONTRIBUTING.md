# Contributing to Honcho Plugins for Claude Code

Thanks for your interest in contributing! This guide covers the development setup and conventions for both plugins in this repo.

## Project Structure

```text
claude-honcho/
├── .claude-plugin/
│   └── marketplace.json    # Claude Code marketplace manifest
├── plugins/
│   ├── honcho/             # Persistent memory plugin
│   │   ├── src/            # TypeScript source
│   │   ├── hooks/          # Hook entry points + hooks.json
│   │   ├── skills/         # Plugin skills
│   │   ├── scripts/        # build.ts, smoke.sh, and shell helpers
│   │   ├── tests/
│   │   ├── mcp-server.ts   # MCP server entry point
│   │   └── mcp-servers.json
│   └── honcho-dev/         # SDK skills plugin (no compiled code)
│       ├── skills/
│       └── .claude-plugin/
├── assets/
├── CHANGELOG.md
└── README.md
```

## How the `honcho` plugin ships

Development runs TypeScript directly under Bun. Releases are bundled with
`scripts/build.ts` into a self-contained tree that runs under plain Node, and
published to npm as `@honcho-ai/claude-honcho`. The marketplace installs that
package, so users need neither Bun nor an install step.

The practical consequence: **`src/` must stay free of Bun-only APIs.** `Bun.*`,
`import.meta.main`, and `import.meta.dir` all work in development and break the
released bundle. Use `node:` builtins and runtime-agnostic equivalents.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) -- development toolchain (runs TypeScript, bundles releases, runs tests)
- Node 22+ -- what the released plugin runs on
- A Honcho API key from [app.honcho.dev](https://app.honcho.dev)

```bash
git clone https://github.com/plastic-labs/claude-honcho.git
cd claude-honcho/plugins/honcho
bun install
```

### Local Testing

Load your working tree as a plugin for a single session:

```bash
claude --plugin-dir plugins/honcho
```

The plugin loads for that session only and is not installed. It loads
*alongside* an installed copy rather than replacing it, so disable that first
to avoid running two copies of the same hooks and MCP server:

```bash
claude plugin disable honcho@honcho
```

Restart to pick up changes.

### Checks

These are what CI runs, from `plugins/honcho/`:

```bash
bunx tsc --noEmit             # type check
bun test                      # unit tests
bun run scripts/build.ts      # bundle into .stage/
bash scripts/smoke.sh .stage  # every bundled entry point must run under node
```

The smoke test runs the staged tree from a temporary directory with no
`node_modules` on the resolution path, which is what catches an unbundled
dependency or a leftover `.ts` reference.

## Working on the `honcho` Plugin

### Key Files

- `src/hooks/` -- hook implementations (session-start, session-end, user-prompt, pre-compact, post-tool-use, pre-tool, stop, save-user-message)
- `src/mcp/server.ts` -- MCP server for memory tools
- `src/config.ts` -- configuration management
- `src/cache.ts` -- local caching layer
- `hooks/` -- thin entry-point wrappers that import from `src/`, plus `hooks.json`
- `skills/` -- markdown skill definitions; the ones with runners call into `src/skills/`

### Making Changes

- **Source** lives in `src/`. Keep the entry points in `hooks/` thin.
- **Skills** are markdown instructions. A skill that needs code gets a runner in `src/skills/`, invoked from its `SKILL.md`.
- **Entry-point paths** in `hooks.json`, `mcp-servers.json`, and `SKILL.md` files are rewritten from `.ts` to bundled `.js` at build time. Reference them via `${CLAUDE_PLUGIN_ROOT}` and the build will remap them; it fails loudly if a path can't be resolved in the staged tree.

## Working on the `honcho-dev` Plugin

The honcho-dev plugin is skills-only (no code to run). It provides guidance for building apps with the Honcho SDK.

### Key Files

- `skills/integrate/` -- Skill for integrating Honcho into applications
- `skills/migrate-py/` and `skills/migrate-ts/` -- Migration guides for Python and TypeScript

To contribute new skills, create a directory under `plugins/honcho-dev/skills/` with a `SKILL.md` file.

## Code Style

- TypeScript with ESM modules
- No Bun-only APIs in `src/`, `hooks/`, or `mcp-server.ts` (see above)
- Prefer async/await over callbacks
- Keep hook entry points thin -- put logic in `src/`

## Submitting Changes

1. Fork the repo and create a feature branch
2. Make your changes and verify them with the checks above
3. Update `CHANGELOG.md` if your change is user-facing
4. Open a pull request with a clear description of what and why

Releases are cut by maintainers via the `Release` workflow, which takes the
version as a dispatch input. Nothing in the repo needs a version bump in your PR.

## Questions?

Open an issue at [github.com/plastic-labs/claude-honcho](https://github.com/plastic-labs/claude-honcho/issues).
