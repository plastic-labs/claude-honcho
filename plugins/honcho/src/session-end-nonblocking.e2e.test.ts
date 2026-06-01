import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readTranscriptTail } from "./hooks/session-end.js";

// e2e contract for the SessionEnd hook: it must NOT block Claude Code's exit and
// must NOT hang waiting on the Honcho API. We spawn the real hook entry point in a
// child process pointed at a black-hole mock API (every request is received but the
// response is held open forever), under a throwaway HOME (so all state lands in
// $HOME/.honcho). No real network, no real Honcho.
//
// The fix moves the network upload into a detached background worker, so the hook
// itself returns in milliseconds while the upload is delivered out-of-band. These
// tests are RED against the old blocking implementation (which awaits the upload
// up to the SDK timeout) and GREEN once the worker is in place.

// the real production entry that hooks.json runs: the thin hooks/session-end.ts
// wrapper (initHook() + handleSessionEnd()), NOT the src/hooks/ logic module
// (which only exports handleSessionEnd and does nothing when run directly). this
// is one dir up from src/, on purpose, so the e2e exercises the full hook exactly
// as Claude Code invokes it.
const HOOK = join(import.meta.dir, "..", "hooks", "session-end.ts");

// hook must return well under this; the old code blocks ~8s on the hung endpoint.
const RETURN_BUDGET_MS = 3000;

interface MockApi {
  url: string;
  requestCount(): number;
  waitForRequest(timeoutMs: number): Promise<boolean>;
  stop(): void;
}

/** A Honcho API stand-in that records every request then holds the response open
 *  forever, emulating a slow / unreachable endpoint. One mock per hook run, so a
 *  request arriving here can only come from THIS run's detached worker. */
function startMockApi(): MockApi {
  const requests: { at: number; path: string }[] = [];
  const waiters = new Set<() => void>();

  const server = Bun.serve({
    port: 0,
    idleTimeout: 0,
    async fetch(req) {
      requests.push({ at: Date.now(), path: new URL(req.url).pathname });
      for (const w of [...waiters]) w();
      // hang forever — never resolve. The caller's own client timeout bounds it.
      await new Promise<void>(() => {});
      return new Response("{}", { headers: { "content-type": "application/json" } });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    requestCount: () => requests.length,
    waitForRequest(timeoutMs) {
      if (requests.length > 0) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const onReq = () => {
          cleanup();
          resolve(true);
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve(false);
        }, timeoutMs);
        function cleanup() {
          waiters.delete(onReq);
          clearTimeout(timer);
        }
        waiters.add(onReq);
      });
    },
    stop: () => server.stop(true),
  };
}

const tmps: string[] = [];
const mocks: MockApi[] = [];
function freshDir(tag: string): string {
  const d = mkdtempSync(join(tmpdir(), `se-${tag}-`));
  tmps.push(d);
  return d;
}

afterAll(() => {
  for (const m of mocks) m.stop();
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});

/** Minimal Claude-transcript JSONL with a meaningful assistant message so the hook
 *  has something to summarize locally and to upload. */
function writeTranscript(dir: string): string {
  const p = join(dir, "transcript.jsonl");
  const lines = [
    { type: "user", timestamp: "2026-06-01T00:00:00.000Z", message: { role: "user", content: "please fix the session-end hook" } },
    {
      type: "assistant",
      timestamp: "2026-06-01T00:00:01.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I implemented the fix and resolved the bug in the session-end hook. The problem was that it blocked on a network upload; I refactored it to a detached background worker so the exit is never delayed.",
          },
        ],
      },
    },
  ];
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

interface HookRun {
  timedOut: boolean;
  exitCode: number | null;
  wallMs: number;
  stateDir: string;
  mock: MockApi;
}

/** Spawn the real SessionEnd hook against a fresh mock API and race its exit
 *  against a hard budget. On timeout we SIGKILL (the old code traps SIGTERM, so a
 *  plain kill would not stop it) and report timedOut. */
async function runHook(): Promise<HookRun> {
  const home = freshDir("home");
  const stateDir = join(home, ".honcho");
  const transcriptPath = writeTranscript(freshDir("tx"));
  const mock = startMockApi();
  mocks.push(mock);

  const hookInput = {
    session_id: "e2e-session",
    transcript_path: transcriptPath,
    cwd: home,
    reason: "exit",
  };

  const childEnv: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    HONCHO_API_KEY: "test-key",
    HONCHO_ENDPOINT: mock.url,
    HONCHO_SAVE_MESSAGES: "true",
  };

  const start = Date.now();
  const proc = Bun.spawn([process.execPath, "run", HOOK], {
    env: childEnv,
    stdin: Buffer.from(JSON.stringify(hookInput)),
    stdout: "ignore",
    stderr: "ignore",
  });

  const raced = await Promise.race([
    proc.exited.then((code) => ({ kind: "exit" as const, code })),
    Bun.sleep(RETURN_BUDGET_MS).then(() => ({ kind: "timeout" as const })),
  ]);

  const wallMs = Date.now() - start;
  if (raced.kind === "timeout") {
    proc.kill("SIGKILL");
    return { timedOut: true, exitCode: null, wallMs, stateDir, mock };
  }
  return { timedOut: false, exitCode: raced.code, wallMs, stateDir, mock };
}

describe("SessionEnd hook does not block exit (e2e)", () => {
  test(
    "returns within the budget and exits 0 even when the Honcho API hangs",
    async () => {
      const run = await runHook();
      expect(run.timedOut, `hook blocked > ${RETURN_BUDGET_MS}ms on a hung API (wall=${run.wallMs}ms)`).toBe(false);
      expect(run.exitCode).toBe(0);
    },
    20_000,
  );

  test(
    "still writes the local summary (claude-context.md) before returning",
    async () => {
      const run = await runHook();
      expect(run.timedOut).toBe(false);
      expect(existsSync(join(run.stateDir, "claude-context.md"))).toBe(true);
    },
    20_000,
  );

  test(
    "delivers the memory upload out-of-band (detached worker reaches the API after the hook returned)",
    async () => {
      const run = await runHook();
      // hook must have returned promptly...
      expect(run.timedOut, `hook blocked > ${RETURN_BUDGET_MS}ms (wall=${run.wallMs}ms)`).toBe(false);
      expect(run.exitCode).toBe(0);
      // ...and the upload must still happen, from THIS run's detached worker, after exit.
      const delivered = await run.mock.waitForRequest(10_000);
      expect(delivered, "no upload request reached the API — the worker did not run").toBe(true);
    },
    25_000,
  );

  test.skipIf(process.platform === "win32")(
    "writes the queued payload privately (0700 dir, 0600 file)",
    async () => {
      const run = await runHook();
      expect(run.timedOut).toBe(false);
      // the parent writes the payload before exit; the worker is hung on the mock,
      // so the payload is still on disk here.
      const queueDir = join(run.stateDir, "session-end-queue");
      expect(existsSync(queueDir)).toBe(true);
      // the dir is 0700 (private + traversable); payload files must be exactly
      // 0600 — private AND non-executable. they must NOT inherit the dir's exec
      // bit: chmod is applied to the directory only, never recursively to files.
      expect(statSync(queueDir).mode & 0o777, "queue dir must be exactly 0700").toBe(0o700);
      const payloads = readdirSync(queueDir).filter((n) => n.startsWith("payload-") && n.endsWith(".json"));
      expect(payloads.length).toBeGreaterThan(0);
      for (const name of payloads) {
        const mode = statSync(join(queueDir, name)).mode & 0o777;
        expect(mode, `${name} must be exactly 0600 (private, not executable)`).toBe(0o600);
      }
    },
    20_000,
  );
});

describe("readTranscriptTail", () => {
  test("returns the full file when under the cap", () => {
    const dir = freshDir("tail");
    const p = join(dir, "t.jsonl");
    const body = "line-a\nline-b\nline-c\n";
    writeFileSync(p, body);
    expect(readTranscriptTail(p, 1024)).toBe(body);
  });

  test("reads only the tail and drops the partial first line when over the cap", () => {
    const dir = freshDir("tail");
    const p = join(dir, "big.jsonl");
    const lines: string[] = [];
    for (let i = 0; i < 2000; i++) lines.push(`{"type":"assistant","i":${i}}`);
    const body = lines.join("\n") + "\n";
    writeFileSync(p, body);

    const cap = 200;
    const tail = readTranscriptTail(p, cap);
    // bounded: never returns more than the cap...
    expect(tail.length).toBeLessThanOrEqual(cap);
    // ...starts on a clean line boundary (no half a line)...
    expect(tail.startsWith("{")).toBe(true);
    // ...and still contains the most recent (last) line.
    expect(tail.includes(lines[lines.length - 1])).toBe(true);
  });
});
