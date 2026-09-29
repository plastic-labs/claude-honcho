import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// cache.ts and config.ts read ~/.honcho/ via a module-level homedir() const, so
// the resolution runs in a child process with HOME pointed at a fixture.
function runInSandbox(home: string, cwd: string, extraEnv: Record<string, string>, script: string): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("HONCHO_") && k !== "CLAUDE_PROJECT_DIR")
  ) as Record<string, string>;
  const proc = Bun.spawnSync(["bun", "-e", script], {
    env: { ...env, HOME: home, ...extraEnv },
    cwd,
  });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  return proc.stdout.toString().trim();
}

const pluginRoot = join(import.meta.dir, "..");
const script = `
  import { resolveMcpCwd } from ${JSON.stringify(join(pluginRoot, "src/mcp/server.ts"))};
  import { getSessionName } from ${JSON.stringify(join(pluginRoot, "src/config.ts"))};
  const cwd = resolveMcpCwd();
  console.log(JSON.stringify({ cwd, session: getSessionName(cwd) }));
`;

describe("MCP session cwd (integration)", () => {
  function fixture() {
    const home = mkdtempSync(join(tmpdir(), "honcho-mcp-"));
    const own = join(home, "own-project");
    const other = join(home, "other-project");
    mkdirSync(own, { recursive: true });
    mkdirSync(other, { recursive: true });
    mkdirSync(join(home, ".honcho"), { recursive: true });
    writeFileSync(
      join(home, ".honcho", "config.json"),
      JSON.stringify({ apiKey: "k", peerName: "t", sessionPeerPrefix: false })
    );
    // Another session started more recently in a different directory.
    writeFileSync(
      join(home, ".honcho", "cache.json"),
      JSON.stringify({
        sessions: {
          [own]: { name: "own-project", id: "a", updatedAt: "2026-01-01T00:00:00.000Z" },
          [other]: { name: "other-project", id: "b", updatedAt: "2026-01-02T00:00:00.000Z" },
        },
      })
    );
    return { home, own, other };
  }

  test("CLAUDE_PROJECT_DIR wins over a newer cache entry for another directory", () => {
    const { home, own } = fixture();
    try {
      const r = JSON.parse(runInSandbox(home, home, { CLAUDE_PROJECT_DIR: own }, script));
      expect(r.cwd).toBe(own);
      expect(r.session).toBe("own-project");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("without CLAUDE_PROJECT_DIR the server's own cwd wins over the cache", () => {
    const { home, own } = fixture();
    try {
      const r = JSON.parse(runInSandbox(home, own, {}, script));
      expect(r.session).toBe("own-project");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
