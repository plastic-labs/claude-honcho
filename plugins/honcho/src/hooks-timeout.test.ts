import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Upstream #59 — hooks.json `timeout` is SECONDS, not milliseconds.
 *
 * Claude Code's hook reference is explicit: `timeout` is "Seconds before
 * canceling" (https://code.claude.com/docs/en/hooks — Common fields). The file
 * used to mix units: `30000`/`20000`/`4000`/`2000` (plainly intended as ms)
 * next to `120`/`10` (plainly seconds). Read as seconds, `30000` is ~8.3 hours
 * — i.e. no timeout at all, which is the bug.
 *
 * These assertions pin the corrected SECOND values. They deliberately assert
 * only the `timeout` fields — never the `command` strings — so this test stays
 * green independently of the bun-resolution change (#82) that rewrites commands.
 */

const HOOKS_JSON = join(import.meta.dir, "..", "hooks", "hooks.json");

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
  async?: boolean;
}

function loadHooks(): HookEntry[] {
  const parsed = JSON.parse(readFileSync(HOOKS_JSON, "utf-8"));
  const out: HookEntry[] = [];
  for (const matchers of Object.values(parsed.hooks as Record<string, any[]>)) {
    for (const matcher of matchers) {
      for (const hook of matcher.hooks as HookEntry[]) out.push(hook);
    }
  }
  return out;
}

/** Timeouts keyed by the hook script's basename (or the shell script's). */
function timeoutsByScript(): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const hook of loadHooks()) {
    // The LAST script name in the command line is the hook itself — anything
    // earlier is a launcher (e.g. scripts/run-hook.sh, which resolves bun).
    const all = hook.command.match(/[\w.-]+\.(?:ts|sh)/g);
    const key = all?.length ? all[all.length - 1]! : hook.command;
    (map[key] ??= []).push(hook.timeout as number);
  }
  return map;
}

test("every hook declares a timeout", () => {
  for (const hook of loadHooks()) {
    expect(typeof hook.timeout).toBe("number");
  }
});

test("no hook timeout is a millisecond value misread as seconds", () => {
  // The tightest defensible ceiling: the longest-running hook is the
  // UserPromptSubmit read path, bounded internally by DIALECTIC_TIMEOUT_MS
  // (120s). Anything above that is a unit error, not a real budget.
  for (const hook of loadHooks()) {
    expect(hook.timeout!).toBeGreaterThan(0);
    expect(hook.timeout!).toBeLessThanOrEqual(125);
  }
});

test("each hook's timeout matches its real workload, in seconds", () => {
  const t = timeoutsByScript();

  // curl --max-time 2 is the only network call; the rest is sed/find + spawn.
  expect(t["check-version.sh"]).toEqual([5]);

  // Parallel context warm-up; the code documents a 30s budget. async: true, so
  // this never blocks the user.
  expect(t["session-start.ts"]).toEqual([30]);

  // Touches NO network (see handleSessionEnd) — purely local file cleanup. Kept
  // deliberately small: per the hook reference, SessionEnd hooks share a
  // 1.5s shutdown budget which Claude Code RAISES to match a longer per-hook
  // timeout (up to 60s), so an inflated value here would stall /exit for
  // nothing.
  expect(t["session-end.ts"]).toEqual([5]);

  // One session.addMessages POST bounded internally by UPLOAD_TIMEOUT_MS (5s),
  // plus interpreter start.
  expect(t["post-tool-use.ts"]).toEqual([10]);

  // Local-only: parse stdin, write one state file. Blocks the MCP tool call, so
  // it stays tight — the headroom is for a cold interpreter start, not work.
  expect(t["pre-tool-honcho.ts"]).toEqual([4]);

  // The read path races a 4s context fetch (FETCH_TIMEOUT_MS) and a 120s
  // dialectic budget (DIALECTIC_TIMEOUT_MS). MUST be strictly greater than the
  // internal budget: at 120 vs 120000ms the harness would kill the process at
  // the exact moment the internal race resolves, so the graceful-degradation
  // path could never print its JSON.
  expect(t["user-prompt.ts"]).toEqual([125]);
  expect(t["user-prompt.ts"]![0]!).toBeGreaterThan(120);

  // Async write half of UserPromptSubmit: one batched POST, off the hot path.
  expect(t["save-user-message.ts"]).toEqual([30]);

  // Two parallel peer.chat() calls at "low" reasoning plus a context() fetch,
  // no internal bound. Registered twice (auto + manual triggers).
  expect(t["pre-compact.ts"]).toEqual([20, 20]);

  // Transcript scan + upload, async.
  expect(t["stop.ts"]).toEqual([10]);
});
