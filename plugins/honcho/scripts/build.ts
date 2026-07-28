#!/usr/bin/env bun
// Stage a self-contained release tree in .stage/: bundle every hook entry
// point and the MCP server, rewrite manifest paths to the bundled output,
// and stamp the version from package.json. Nothing in .stage/ is committed.
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const STAGE = join(ROOT, ".stage");

const version = (await Bun.file(join(ROOT, "package.json")).json()).version as string;

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

// Manifests: rewrite source entry points to their bundled locations (the
// stage runs under node, dev runs .ts under bun), then verify every
// rewritten path exists in the stage.
function assertStagedPaths(relPath: string, text: string): void {
  for (const [, staged] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/(dist\/[\w/-]+\.js)/g)) {
    if (!existsSync(join(STAGE, staged))) {
      console.error(`${relPath} references ${staged}, which the build did not produce`);
      process.exit(1);
    }
  }
}

const hooksJson = (await Bun.file(join(ROOT, "hooks/hooks.json")).text()).replace(
  /bun run \$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w-]+)\.ts/g,
  "node ${CLAUDE_PLUGIN_ROOT}/dist/$1.js",
);
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
      name: "@honcho-ai/claude-plugin",
      version,
      type: "module",
      description: pluginManifest.description,
      author: "Plastic Labs <hello@plasticlabs.ai>",
      license: pluginManifest.license,
      repository: pluginManifest.repository,
      keywords: pluginManifest.keywords,
    },
    null,
    2,
  ) + "\n",
);

await cp(join(ROOT, "skills"), join(STAGE, "skills"), { recursive: true });
await mkdir(join(STAGE, "scripts"), { recursive: true });
await cp(join(ROOT, "scripts/check-version.sh"), join(STAGE, "scripts/check-version.sh"));

const bundled = result.outputs.reduce((sum, artifact) => sum + artifact.size, 0);
console.log(`staged ${version} -> .stage/ (${result.outputs.length} files, ${(bundled / 1024 / 1024).toFixed(1)} MB bundled)`);
