#!/usr/bin/env bun
// Stage a self-contained release tree in .stage/: bundle every entry point
// (hooks, MCP server, skill runners), rewrite manifest and skill paths to
// the bundled output, and stamp the version. The version comes from
// RELEASE_VERSION (set by the release workflow), falling back to
// package.json for local builds; the version fields left in source are
// dev-only fallbacks, never published. Nothing in .stage/ is committed.
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const STAGE = join(ROOT, ".stage");

const version =
  process.env.RELEASE_VERSION ||
  ((await Bun.file(join(ROOT, "package.json")).json()).version as string);

await rm(STAGE, { recursive: true, force: true });
await mkdir(join(STAGE, ".claude-plugin"), { recursive: true });

// Bundle: one self-contained entry per hook wrapper, plus the MCP server.
const hookEntries = (await readdir(join(ROOT, "hooks")))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => join(ROOT, "hooks", f));

const result = await Bun.build({
  entrypoints: [...hookEntries, join(ROOT, "mcp-server.ts")],
  outdir: join(STAGE, "dist"),
  root: ROOT,
  target: "node",
  splitting: true,
  sourcemap: "linked",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Skill runners: separate build rooted at src/ so entries land in
// dist/skills/, where setup-runner's ../../scripts hop finds the staged
// statusline script.
const runnerEntries = (await readdir(join(ROOT, "src/skills")))
  .filter((f) => f.endsWith("-runner.ts"))
  .map((f) => join(ROOT, "src/skills", f));

const runnerResult = await Bun.build({
  entrypoints: runnerEntries,
  outdir: join(STAGE, "dist"),
  root: join(ROOT, "src"),
  target: "node",
  splitting: true,
  sourcemap: "linked",
});
if (!runnerResult.success) {
  for (const log of runnerResult.logs) console.error(log);
  process.exit(1);
}

// Scripts stage before the manifests so the resolution check below can see
// them.
await mkdir(join(STAGE, "scripts"), { recursive: true });
await cp(join(ROOT, "scripts/check-version.sh"), join(STAGE, "scripts/check-version.sh"));
await cp(join(ROOT, "scripts/honcho-statusline.sh"), join(STAGE, "scripts/honcho-statusline.sh"));

// Every ${CLAUDE_PLUGIN_ROOT} reference in a staged file must resolve within
// the stage, and none may point at source TypeScript (a rewrite miss).
function assertStagedPaths(relPath: string, text: string): void {
  for (const [token] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/[^\s"'`)\\]+/g)) {
    const staged = token.replace("${CLAUDE_PLUGIN_ROOT}/", "");
    if (staged.endsWith(".ts")) {
      console.error(`${relPath} still references source TypeScript after rewrite: ${token}`);
      process.exit(1);
    }
    if (!existsSync(join(STAGE, staged))) {
      console.error(`${relPath} references ${staged}, which is not in the stage`);
      process.exit(1);
    }
  }
}

function rewriteEntryPoints(text: string): string {
  return text
    .replace(/bun run ("?)\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w-]+|mcp-server)\.ts\1/g, 'node $1${CLAUDE_PLUGIN_ROOT}/dist/$2.js$1')
    .replace(/bun run ("?)\$\{CLAUDE_PLUGIN_ROOT\}\/src\/(skills\/[\w-]+)\.ts\1/g, 'node $1${CLAUDE_PLUGIN_ROOT}/dist/$2.js$1');
}

const hooksJson = rewriteEntryPoints(await Bun.file(join(ROOT, "hooks/hooks.json")).text());
assertStagedPaths("hooks/hooks.json", hooksJson);
await Bun.write(join(STAGE, "hooks/hooks.json"), hooksJson);

const mcpServers = await Bun.file(join(ROOT, "mcp-servers.json")).json();
for (const server of Object.values(mcpServers) as Array<{ command: string; args: string[] }>) {
  if (server.command !== "bun") continue;
  server.command = "node";
  server.args = server.args
    .filter((arg) => arg !== "run")
    .map((arg) => arg.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w-]+)\.ts/, "${CLAUDE_PLUGIN_ROOT}/dist/$1.js"));
}
const mcpJson = JSON.stringify(mcpServers, null, 2) + "\n";
assertStagedPaths("mcp-servers.json", mcpJson);
await Bun.write(join(STAGE, "mcp-servers.json"), mcpJson);

// plugin.json: version stamped from package.json. hooks/hooks.json and
// skills/ are auto-discovered, so neither needs a manifest field.
const pluginManifest = await Bun.file(join(ROOT, ".claude-plugin/plugin.json")).json();
await Bun.write(
  join(STAGE, ".claude-plugin/plugin.json"),
  JSON.stringify({ ...pluginManifest, version }, null, 2) + "\n",
);

// package.json: publish manifest for the npm source. Deps are bundled, so
// none are declared.
await Bun.write(
  join(STAGE, "package.json"),
  JSON.stringify(
    {
      name: "@honcho-ai/claude-honcho",
      version,
      type: "module",
      description: pluginManifest.description,
      author: "Plastic Labs <hello@plasticlabs.ai>",
      license: pluginManifest.license,
      repository: { type: "git", url: `git+${pluginManifest.repository}.git` },
      keywords: pluginManifest.keywords,
    },
    null,
    2,
  ) + "\n",
);

// Skills: copy verbatim except SKILL.md, which gets the same entry-point
// rewrite and resolution check as the manifests.
await cp(join(ROOT, "skills"), join(STAGE, "skills"), { recursive: true });
for (const skill of await readdir(join(STAGE, "skills"))) {
  const skillMd = join(STAGE, "skills", skill, "SKILL.md");
  if (!existsSync(skillMd)) continue;
  const text = rewriteEntryPoints(await Bun.file(skillMd).text());
  assertStagedPaths(`skills/${skill}/SKILL.md`, text);
  await Bun.write(skillMd, text);
}

const outputs = [...result.outputs, ...runnerResult.outputs];
const bundled = outputs.reduce((sum, artifact) => sum + artifact.size, 0);
console.log(`staged ${version} -> .stage/ (${outputs.length} files, ${(bundled / 1024 / 1024).toFixed(1)} MB bundled)`);
