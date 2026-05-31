import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

// e2e: spawn the probe in a child process with a controlled HOME + HONCHO_HOME so the
// plugin's module-load-time state-dir constants are captured fresh per scenario, then
// assert where config / cache / activity.log / verbose.log actually resolve and write.
// No network, no real deploy; everything lands in throwaway temp dirs.

const PROBE = join(import.meta.dir, "honcho-home-probe.ts");
const tmps: string[] = [];
function freshDir(tag: string): string {
  const d = mkdtempSync(join(tmpdir(), `hh-${tag}-`));
  tmps.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});

function runProbe(env: Record<string, string | undefined>): {
  configDir: string; configPath: string; logPath: string; verbosePath: string;
  cacheFileWritten: boolean; logFileWritten: boolean;
} {
  // replace env entirely (do not inherit the real HOME / HONCHO_HOME); keep PATH for bun
  const childEnv: Record<string, string> = { PATH: process.env.PATH ?? "" };
  for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
  const res = Bun.spawnSync({ cmd: [process.execPath, "run", PROBE], env: childEnv });
  if (!res.success) {
    throw new Error(`probe exited ${res.exitCode}: ${res.stderr.toString()}`);
  }
  const lines = res.stdout.toString().trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

describe("HONCHO_HOME state-dir relocation (e2e)", () => {
  test("unset HONCHO_HOME -> state lives under $HOME/.honcho (backward compatible)", () => {
    const home = freshDir("home");
    const r = runProbe({ HOME: home });
    expect(r.configDir).toBe(join(home, ".honcho"));
    expect(dirname(r.logPath)).toBe(join(home, ".honcho"));
    expect(r.cacheFileWritten).toBe(true);
    expect(r.logFileWritten).toBe(true);
  });

  test("absolute HONCHO_HOME -> all state is relocated there, nothing leaks to $HOME/.honcho", () => {
    const home = freshDir("home");
    const state = freshDir("state");
    const r = runProbe({ HOME: home, HONCHO_HOME: state });
    expect(r.configDir).toBe(state);
    expect(dirname(r.logPath)).toBe(state);
    expect(r.cacheFileWritten).toBe(true);
    expect(r.logFileWritten).toBe(true);
    expect(existsSync(join(home, ".honcho", "cache.json"))).toBe(false);
  });

  test("tilde HONCHO_HOME (~/sub) -> expanded under $HOME", () => {
    const home = freshDir("home");
    const r = runProbe({ HOME: home, HONCHO_HOME: "~/honcho-alt" });
    expect(r.configDir).toBe(join(home, "honcho-alt"));
  });

  test("whitespace HONCHO_HOME -> falls back to $HOME/.honcho", () => {
    const home = freshDir("home");
    const r = runProbe({ HOME: home, HONCHO_HOME: "   " });
    expect(r.configDir).toBe(join(home, ".honcho"));
  });

  test("config + cache + activity.log + verbose.log are all co-located under HONCHO_HOME", () => {
    const home = freshDir("home");
    const state = freshDir("state");
    const r = runProbe({ HOME: home, HONCHO_HOME: state });
    // every state file must sit in the SAME overridden directory
    expect(dirname(r.configPath)).toBe(state);
    expect(r.configDir).toBe(state);
    expect(dirname(r.logPath)).toBe(state);     // activity.log
    expect(dirname(r.verbosePath)).toBe(state); // verbose.log
  });
});
