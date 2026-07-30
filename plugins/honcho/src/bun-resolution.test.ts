import { test, expect } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Upstream #82 — a missing `bun` must fail LOUDLY, not silently.
 *
 * hooks.json used to invoke `bun run …` directly. Claude Code runs hooks
 * non-interactively, so bun can be absent from PATH even when the user's
 * terminal has it; memory capture then stopped with no message anywhere. The
 * guard cannot live in TypeScript (the missing runtime is what would execute
 * it), so it lives in scripts/run-hook.sh.
 *
 * Visible channel: stderr + a non-zero exit. Per Claude Code's hook reference,
 * a non-zero exit other than 2 is a non-blocking error whose first stderr line
 * is shown in the transcript without --debug. stdout is deliberately NOT used:
 * on UserPromptSubmit, exit-0 stdout is injected into the model's context.
 */

const WRAPPER = join(import.meta.dir, "..", "scripts", "run-hook.sh");
const HOOKS_JSON = join(import.meta.dir, "..", "hooks", "hooks.json");

function hookCommands(): string[] {
  const parsed = JSON.parse(readFileSync(HOOKS_JSON, "utf-8"));
  const out: string[] = [];
  for (const matchers of Object.values(parsed.hooks as Record<string, any[]>)) {
    for (const matcher of matchers) {
      for (const hook of matcher.hooks as { command: string }[]) out.push(hook.command);
    }
  }
  return out;
}

/**
 * Run the wrapper with bun made unreachable: an empty PATH neutralizes
 * `command -v bun`, and HONCHO_BUN_CANDIDATES points the fallback list at a
 * path that cannot exist (the real /opt/homebrew/bin/bun exists on many dev
 * machines, so overriding the list is what makes this test deterministic).
 */
async function runWithoutBun(env: Record<string, string> = {}) {
  const proc = Bun.spawn(["/bin/sh", WRAPPER, "/tmp/does-not-matter.ts"], {
    env: {
      PATH: "",
      HOME: "/nonexistent-home",
      HONCHO_BUN_CANDIDATES: "/nonexistent/path/to/bun",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("every TypeScript hook goes through the bun-resolving wrapper", () => {
  for (const cmd of hookCommands()) {
    if (cmd.includes("/hooks/")) {
      expect(cmd).toContain("scripts/run-hook.sh");
      // No hook may invoke a bare `bun` any more — that is the silent-failure path.
      expect(cmd).not.toMatch(/(^|[^-\w])bun run/);
    }
  }
});

test("a missing bun produces a visible error, not silence", async () => {
  const { stdout, stderr, exitCode } = await runWithoutBun();

  // Loud: non-zero exit so the transcript shows "<hook> hook error" + stderr line 1.
  expect(exitCode).not.toBe(0);
  // Not exit 2 — that would BLOCK the user's prompt/tool call over a broken install.
  expect(exitCode).not.toBe(2);

  // Diagnosable: names the missing binary, the consequence, and the two fixes.
  expect(stderr).toContain("bun");
  expect(stderr).toContain("not found");
  expect(stderr.toLowerCase()).toContain("memory capture");
  expect(stderr).toContain("HONCHO_BUN");
  // First stderr line carries the whole diagnosis — that's the only line the
  // transcript notice shows.
  expect(stderr.trim().split("\n")[0]!).toContain("not found");

  // Nothing on stdout: on UserPromptSubmit stdout becomes model context.
  expect(stdout).toBe("");
});

test("HONCHO_BUN overrides resolution when PATH has no bun", async () => {
  const dir = mkdtempSync(join(tmpdir(), "honcho-bun-"));
  try {
    const fakeBun = join(dir, "bun");
    // A stand-in that proves the wrapper exec'd it with `run <script>`.
    writeFileSync(fakeBun, '#!/bin/sh\necho "ran:$1:$2"\n');
    chmodSync(fakeBun, 0o755);

    const proc = Bun.spawn(["/bin/sh", WRAPPER, "/tmp/hook.ts", "--extra"], {
      env: {
        PATH: "",
        HOME: "/nonexistent-home",
        HONCHO_BUN_CANDIDATES: "/nonexistent/path/to/bun",
        HONCHO_BUN: fakeBun,
      },
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("ran:run:/tmp/hook.ts");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the wrapper is dependency-free POSIX sh and never reads stdin", () => {
  const src = readFileSync(WRAPPER, "utf-8");
  expect(src.startsWith("#!/bin/sh")).toBe(true);
  // Reading stdin here would consume the hook payload before exec.
  expect(src).not.toMatch(/\bread\b/);
  expect(src).not.toContain("cat -");
  // One exec, so the wrapper adds no lingering process to the hot path.
  expect(src).toContain("exec ");
  // bashisms that would break under dash/ash
  expect(src).not.toContain("[[");
  expect(src).not.toContain("$(<");
});
