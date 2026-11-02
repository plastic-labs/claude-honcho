#!/usr/bin/env bun
// Harness e2e: drive a real harness through a scripted conversation against
// the Honcho sandbox and assert memory round-trips. See e2e/README.md.
//
//   bun run e2e [--harness claude-code] [--variant <name>] [--real] [--keep] [--no-build]
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { assertRoundTrip } from "./assert.js";
import type { HarnessAdapter } from "./harness.js";
import { claudeCode } from "./harnesses/claude-code.js";
import { ensureSandboxCheckout, isSandboxUp, sandbox, SANDBOX_URL } from "./sandbox.js";
import { turns } from "./scenario.js";

const HARNESSES: Record<string, HarnessAdapter> = { [claudeCode.name]: claudeCode };

const { values: args } = parseArgs({
  options: {
    harness: { type: "string", default: "claude-code" },
    variant: { type: "string" },
    real: { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    "no-build": { type: "boolean", default: false },
  },
});

const log = (msg: string) => console.log(`[e2e] ${msg}`);
// Adapters default to a scripted mock model; --real (or E2E_MODEL=real) opts
// into a real one.
if (args.real) process.env.E2E_MODEL = "real";
const started = Date.now();

const adapter = HARNESSES[args.harness!];
if (!adapter) throw new Error(`unknown harness ${args.harness}; known: ${Object.keys(HARNESSES).join(", ")}`);
const variants = adapter.variants.filter((v) => !args.variant || v.name === args.variant);
if (variants.length === 0) throw new Error(`no variant ${args.variant} for ${adapter.name}`);

if (!args["no-build"]) {
  log("building the release stage");
  const build = Bun.spawnSync(["bun", "run", "scripts/build.ts"], { cwd: join(import.meta.dir, ".."), stdout: "inherit", stderr: "inherit" });
  if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
}
await adapter.preflight();

// A sandbox that is already running is reused and left running: every run
// writes to its own fresh workspace, so it never disturbs existing state.
const script = ensureSandboxCheckout(log);
const startedSandbox = !(await isSandboxUp());
if (startedSandbox) {
  log("starting the Honcho sandbox (mock provider)");
  sandbox(script, "up");
} else {
  log(`reusing the sandbox already running at ${SANDBOX_URL}`);
}

let failed = 0;
try {
  for (const variant of variants) {
    const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const workspace = `e2e-${adapter.name}-${variant.name}-${runId}`;
    const runDir = mkdtempSync(join(tmpdir(), `honcho-e2e-${variant.name}-`));
    log(`${adapter.name}/${variant.name}: workspace ${workspace}, run dir ${runDir}`);

    const t0 = Date.now();
    let ok = false;
    let artifacts: string[] = [];
    try {
      const ctx = { baseUrl: SANDBOX_URL, workspace, runId, runDir, turns, log };
      const { expect, result } = await variant.run(ctx);
      artifacts = result.artifacts;
      const checks = await assertRoundTrip(ctx, expect, result);
      for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `\n        ${c.detail}` : ""}`);
      ok = checks.every((c) => c.ok);
    } catch (e) {
      console.log(`  FAIL  ${e instanceof Error ? e.message : e}`);
    }
    log(`${adapter.name}/${variant.name}: ${ok ? "passed" : "FAILED"} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    if (ok && !args.keep) {
      rmSync(runDir, { recursive: true, force: true });
    } else {
      log(`kept ${runDir}${artifacts.length ? `; artifacts:\n  ${artifacts.join("\n  ")}` : ""}`);
    }
    if (!ok) failed++;
  }
} finally {
  if (startedSandbox && !args.keep) {
    log("stopping the sandbox");
    sandbox(script, "down");
  }
}

log(`${variants.length - failed}/${variants.length} variant(s) passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
