#!/usr/bin/env bun
// Harness e2e: drive a real harness through a scripted conversation against
// the Honcho sandbox and assert memory round-trips. See e2e/README.md.
//
//   bun run e2e [--harness claude-code] [--variant <name>] [--model mock|real] [--keep] [--no-build]
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { assertRecall, assertRoundTrip, type CheckResult } from "./assert.js";
import type { HarnessAdapter, ModelMode } from "./harness.js";
import { claudeCode } from "./harnesses/claude-code.js";
import { ensureSandboxCheckout, sandbox, sandboxState, SANDBOX_URL } from "./sandbox.js";
import { turns } from "./scenario.js";

const HARNESSES: Record<string, HarnessAdapter> = { [claudeCode.name]: claudeCode };

const { values: args } = parseArgs({
  options: {
    harness: { type: "string", default: "claude-code" },
    variant: { type: "string" },
    model: { type: "string", default: process.env.E2E_MODEL || "mock" },
    keep: { type: "boolean", default: false },
    "no-build": { type: "boolean", default: false },
  },
});

const log = (msg: string) => console.log(`[e2e] ${msg}`);
const started = Date.now();

// Harnesses default to a scripted mock model; --model real (or E2E_MODEL=real)
// opts into a real one.
if (args.model !== "mock" && args.model !== "real") throw new Error(`--model must be mock or real, not ${args.model}`);
const model = args.model as ModelMode;

const adapter = HARNESSES[args.harness!];
if (!adapter) throw new Error(`unknown harness ${args.harness}; known: ${Object.keys(HARNESSES).join(", ")}`);
const variants = adapter.variants.filter((v) => !args.variant || v.name === args.variant);
if (variants.length === 0) throw new Error(`no variant ${args.variant} for ${adapter.name}`);

if (!args["no-build"]) {
  log("building the release stage");
  const build = Bun.spawnSync(["bun", "run", "scripts/build.ts"], { cwd: join(import.meta.dir, ".."), stdout: "inherit", stderr: "inherit" });
  if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
}
await adapter.preflight(model);

// Teardown registered by adapters (child processes, the model mock, credential
// links), run newest first when a variant ends or the run is interrupted.
const cleanups: Array<() => void> = [];
const runCleanups = () => {
  while (cleanups.length) {
    try {
      cleanups.pop()!();
    } catch {
      // Best effort: keep tearing down the rest.
    }
  }
};

// The sandbox is a shared, fixed-name Compose project. Only a sandbox this run
// created is ever stopped; one that exists but is not answering may hold
// someone's state (a paid real-provider template, say), so it is left alone.
const script = ensureSandboxCheckout(log);
let ownsSandbox = false;
const stopOwnedSandbox = () => {
  if (ownsSandbox && !args.keep) {
    log("stopping the sandbox");
    ownsSandbox = false;
    sandbox(script, "down");
  }
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`${signal}: cleaning up`);
    runCleanups();
    stopOwnedSandbox();
    process.exit(130);
  });
}

const state = await sandboxState();
if (state === "healthy") {
  log(`reusing the sandbox already running at ${SANDBOX_URL}; it is left running`);
} else if (state === "present") {
  console.error(
    `[e2e] a honcho-sandbox Compose project exists but ${SANDBOX_URL} is not answering.\n` +
      `      It is left untouched. Bring it up with \`${script} up\`, or remove it with \`${script} down\`, then rerun.`,
  );
  process.exit(1);
} else {
  log("starting the Honcho sandbox (mock provider)");
  ownsSandbox = true;
  try {
    sandbox(script, "up");
  } catch (e) {
    stopOwnedSandbox();
    throw e;
  }
}

const print = (checks: CheckResult[]) => {
  for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `\n        ${c.detail}` : ""}`);
};

let failed = 0;
try {
  for (const variant of variants) {
    const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const workspace = `e2e-${adapter.name}-${variant.name}-${runId}`;
    const runDir = mkdtempSync(join(tmpdir(), `honcho-e2e-${variant.name}-`));
    log(`${adapter.name}/${variant.name}: workspace ${workspace}, run dir ${runDir}`);

    const t0 = Date.now();
    let ok = false;
    const artifacts: string[] = [];
    try {
      const ctx = { baseUrl: SANDBOX_URL, workspace, runId, runDir, turns, model, log, onCleanup: (fn: () => void) => cleanups.push(fn) };
      const { expect, result, recall } = await variant.run(ctx);
      artifacts.push(...result.artifacts);
      const roundTrip = await assertRoundTrip(ctx, expect, result);
      print(roundTrip);
      const recalled = await assertRecall(ctx, expect, recall);
      artifacts.push(...recalled.artifacts);
      print(recalled.checks);
      ok = [...roundTrip, ...recalled.checks].every((c) => c.ok);
    } catch (e) {
      console.log(`  FAIL  ${e instanceof Error ? e.message : e}`);
    } finally {
      runCleanups();
    }
    log(`${adapter.name}/${variant.name}: ${ok ? "passed" : "FAILED"} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    if (ok && !args.keep) {
      rmSync(runDir, { recursive: true, force: true });
    } else {
      log(`kept ${runDir}${artifacts.length ? `; artifacts:\n  ${[...new Set(artifacts)].join("\n  ")}` : ""}`);
    }
    if (!ok) failed++;
  }
} finally {
  runCleanups();
  stopOwnedSandbox();
}

log(`${variants.length - failed}/${variants.length} variant(s) passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
