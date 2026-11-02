import { existsSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// The Honcho sandbox (plastic-labs/honcho `sandbox/`): a seeded, mock-provider
// Honcho on 127.0.0.1:18000. It is fetched at a pinned commit so every run
// exercises the same compose files, image digest and fixture.

/** plastic-labs/honcho commit the sandbox is taken from. Bump deliberately. */
export const HONCHO_REF = process.env.HONCHO_SANDBOX_REF || "89eb1e7f89b0dda1a1914bc42e54bde022fafda1";
export const SANDBOX_URL = `http://127.0.0.1:${process.env.SANDBOX_API_PORT || "18000"}`;

const HONCHO_REPO = "https://github.com/plastic-labs/honcho.git";

function run(cmd: string[], cwd?: string): void {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) throw new Error(`${cmd.join(" ")} exited ${proc.exitCode}`);
}

function output(cmd: string[], cwd?: string): string {
  const proc = Bun.spawnSync(cmd, { cwd, stderr: "pipe" });
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : "";
}

/**
 * Path to a honcho checkout's `sandbox/sandbox.sh`. HONCHO_SANDBOX_DIR points
 * at an existing checkout (for testing sandbox changes); otherwise the pinned
 * commit is sparse-fetched into a cache dir. `sdks/python` is included because
 * seeding a fresh template runs seed.py against it.
 */
export function ensureSandboxCheckout(log: (msg: string) => void): string {
  const override = process.env.HONCHO_SANDBOX_DIR;
  if (override) {
    const script = join(override, "sandbox", "sandbox.sh");
    if (!existsSync(script)) throw new Error(`HONCHO_SANDBOX_DIR=${override} has no sandbox/sandbox.sh`);
    return script;
  }

  const cacheRoot = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "claude-honcho-e2e");
  const dir = join(cacheRoot, `honcho-${HONCHO_REF.slice(0, 12)}`);
  const script = join(dir, "sandbox", "sandbox.sh");
  if (existsSync(script) && output(["git", "rev-parse", "HEAD"], dir) === HONCHO_REF) return script;

  log(`fetching plastic-labs/honcho@${HONCHO_REF.slice(0, 12)} sandbox into ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  run(["git", "init", "-q"], dir);
  run(["git", "remote", "add", "origin", HONCHO_REPO], dir);
  run(["git", "sparse-checkout", "set", "--no-cone", "/sandbox/", "/sdks/python/"], dir);
  run(["git", "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", HONCHO_REF], dir);
  run(["git", "checkout", "-q", "FETCH_HEAD"], dir);
  return script;
}

export async function isSandboxUp(): Promise<boolean> {
  try {
    const res = await fetch(`${SANDBOX_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function sandbox(script: string, command: "up" | "down"): void {
  run(["bash", script, command, "--provider", "mock"]);
}
