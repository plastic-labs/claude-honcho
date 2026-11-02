import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Expectation, HarnessAdapter, HarnessRun, HarnessVariant, RunContext, Turn } from "../harness.js";

// Claude Code with this plugin loaded from the staged release build (.stage/,
// what users install). Everything harness-specific lives here: the plugin's
// config file, how `claude` is launched and driven, and where its transcript is.
//
// Isolation: `claude` runs with HOME pointed at the run dir, so neither the
// developer's ~/.honcho config nor their ~/.claude settings and plugins are
// read. Auth is the one thing carried across: ANTHROPIC_API_KEY when set (CI);
// otherwise the CLI's own login, by linking only its credential store into the
// isolated HOME (the login keychain on macOS, ~/.claude/.credentials.json on
// Linux). No credential is read or copied by this script.

const STAGE = join(import.meta.dir, "..", "..", ".stage");
const MODEL = process.env.E2E_CLAUDE_MODEL || "claude-haiku-5-5";
const AI_PEER = "claude"; // the plugin's default AI peer, deliberately left unset in config

const TURN_TIMEOUT_MS = 180_000;
const HOOK_SETTLE_TIMEOUT_MS = 60_000;
const POLL_MS = 100;

type Event = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function credentialLinks(): Array<[target: string, link: string]> {
  if (process.env.ANTHROPIC_API_KEY) return [];
  if (process.platform === "darwin") return [[join(homedir(), "Library", "Keychains"), join("Library", "Keychains")]];
  const file = join(homedir(), ".claude", ".credentials.json");
  return existsSync(file) ? [[file, join(".claude", ".credentials.json")]] : [];
}

/** The parent environment minus anything that would leak the caller's Claude
 *  Code session (nested-session markers) or Honcho config (HONCHO_* overrides). */
function harnessEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("HONCHO_") || k.startsWith("CLAUDE_CODE_")) continue;
    if (k === "CLAUDECODE" || k === "CLAUDE_PID" || k === "CLAUDE_EFFORT" || k === "CLAUDE_CONFIG_DIR") continue;
    env[k] = v;
  }
  env.HOME = home;
  return env;
}

/** Line-buffered reader over claude's stream-json stdout. */
class EventLog {
  events: Event[] = [];
  done: Promise<void>;

  constructor(stream: ReadableStream<Uint8Array>, private file: string) {
    writeFileSync(file, "");
    this.done = this.pump(stream);
  }

  private async pump(stream: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of stream) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        writeFileSync(this.file, line + "\n", { flag: "a" });
        try {
          this.events.push(JSON.parse(line));
        } catch {
          // Non-JSON output is kept in the raw log only.
        }
      }
    }
  }

  /** Index of the first event at or after `from` matching `pred`. */
  async waitFor(from: number, pred: (e: Event) => boolean, what: string, timeoutMs = TURN_TIMEOUT_MS): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    for (let i = from; ; ) {
      for (; i < this.events.length; i++) if (pred(this.events[i])) return i;
      if (Date.now() > deadline) throw new Error(`claude-code: timed out waiting for ${what} (see ${this.file})`);
      await sleep(POLL_MS);
    }
  }

  /** Wait until every hook that has started (async ones included) has reported
   *  back. Uploads run in async hooks; closing stdin before they finish makes
   *  `claude -p` cancel them. */
  async settleHooks(): Promise<void> {
    const deadline = Date.now() + HOOK_SETTLE_TIMEOUT_MS;
    for (;;) {
      const started = new Set(this.events.filter((e) => e.subtype === "hook_started").map((e) => e.hook_id));
      for (const e of this.events) if (e.subtype === "hook_response") started.delete(e.hook_id);
      if (started.size === 0) return;
      if (Date.now() > deadline) throw new Error(`claude-code: ${started.size} hook(s) never finished (see ${this.file})`);
      await sleep(POLL_MS);
    }
  }
}

const isResult = (e: Event) => e.type === "result";
const isWakeup = (e: Event) => e.type === "system" && e.subtype === "task_notification";

async function converse(ctx: RunContext, home: string, cwd: string): Promise<{ replies: string[]; sessionId: string; artifacts: string[] }> {
  const streamFile = join(ctx.runDir, "claude-stream.jsonl");
  const stderrFile = join(ctx.runDir, "claude-stderr.txt");
  const proc = Bun.spawn(
    [
      "claude", "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-hook-events",
      "--model", MODEL,
      "--plugin-dir", STAGE,
      "--permission-mode", "bypassPermissions",
    ],
    { cwd, env: harnessEnv(home), stdin: "pipe", stdout: "pipe", stderr: Bun.file(stderrFile) },
  );
  const log = new EventLog(proc.stdout, streamFile);
  const replies: string[] = [];

  const send = (t: Turn) => {
    proc.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: t.prompt } }) + "\n");
    proc.stdin.flush();
  };
  const takeResult = (i: number) => {
    const e = log.events[i];
    if (e.is_error || e.subtype !== "success") throw new Error(`claude-code: turn failed: ${JSON.stringify(e).slice(0, 500)}`);
    replies.push(String(e.result ?? ""));
  };

  try {
    for (const [n, turn] of ctx.turns.entries()) {
      const from = log.events.length;
      ctx.log(`turn ${n + 1}: sending prompt`);
      send(turn);
      const done = await log.waitFor(from, isResult, `turn ${n + 1} result`);
      takeResult(done);
      if (turn.expectsWakeup) {
        const wake = await log.waitFor(from, isWakeup, `turn ${n + 1} background task notification`);
        takeResult(await log.waitFor(Math.max(wake, done + 1), isResult, `turn ${n + 1} wakeup result`));
      }
      await log.settleHooks();
    }
  } finally {
    proc.stdin.end();
    const exited = await Promise.race([proc.exited.then(() => true), sleep(30_000).then(() => false)]);
    if (!exited) proc.kill();
    await log.done;
  }

  const init = log.events.find((e) => e.type === "system" && e.subtype === "init");
  return { replies, sessionId: String(init?.session_id ?? ""), artifacts: [streamFile, stderrFile] };
}

/** User-role text entries in Claude Code's transcript, tool results excluded. */
function transcriptUserTexts(home: string, sessionId: string): { texts: string[]; file?: string } {
  const projects = join(home, ".claude", "projects");
  const file = existsSync(projects)
    ? readdirSync(projects).map((d) => join(projects, d, `${sessionId}.jsonl`)).find((f) => existsSync(f))
    : undefined;
  if (!file) return { texts: [] };
  const texts: string[] = [];
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.type !== "user") continue;
    const content = entry.message?.content;
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      const text = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      if (text) texts.push(text);
    }
  }
  return { texts, file };
}

function variant(name: string, observationMode: "unified" | "directional"): HarnessVariant {
  return {
    name,
    async run(ctx) {
      const home = join(ctx.runDir, "home");
      const cwd = join(ctx.runDir, "project");
      mkdirSync(join(home, ".honcho"), { recursive: true });
      mkdirSync(cwd, { recursive: true });
      const links = credentialLinks().map(([target, link]) => {
        mkdirSync(join(home, link, ".."), { recursive: true });
        symlinkSync(target, join(home, link));
        return join(home, link);
      });

      const userPeer = `e2e-user-${ctx.runId}`;
      writeFileSync(
        join(home, ".honcho", "config.json"),
        JSON.stringify({
          apiKey: "e2e-sandbox",
          peerName: userPeer,
          endpoint: { baseUrl: ctx.baseUrl },
          hosts: { claude_code: { workspace: ctx.workspace, observationMode } },
        }, null, 2),
      );

      // The links are removed as soon as the harness exits, so nothing that
      // later cleans up or archives the run dir can reach the credential store.
      let conversation: Awaited<ReturnType<typeof converse>>;
      try {
        conversation = await converse(ctx, home, cwd);
      } finally {
        for (const link of links) unlinkSync(link);
      }
      const { replies, sessionId, artifacts } = conversation;
      const transcript = transcriptUserTexts(home, sessionId);
      const honchoLogs = ["activity.log", "verbose.log"].map((f) => join(home, ".honcho", f)).filter((f) => existsSync(f));
      const result: HarnessRun = {
        assistantReplies: replies,
        transcriptUserTexts: transcript.texts,
        artifacts: [...artifacts, ...honchoLogs, ...(transcript.file ? [transcript.file] : [])],
      };

      // Per-directory session naming: "<peer>-<cwd basename>".
      const expect: Expectation = {
        session: `${userPeer}-project`,
        userPeer,
        aiPeer: AI_PEER,
        topology: {
          [userPeer]: { observeMe: true, observeOthers: false },
          [AI_PEER]: { observeMe: true, observeOthers: observationMode === "directional" },
        },
        // unified: the user's self-collection is the shared memory, and the AI
        // must not grow a private view of the user. directional: the AI keeps
        // its own view of the user.
        derivedPairs: observationMode === "unified" ? [[userPeer, userPeer]] : [[AI_PEER, userPeer]],
        emptyPairs: observationMode === "unified" ? [[AI_PEER, userPeer]] : [],
      };
      return { expect, result };
    },
  };
}

export const claudeCode: HarnessAdapter = {
  name: "claude-code",
  async preflight() {
    const version = Bun.spawnSync(["claude", "--version"], { stderr: "pipe" });
    if (version.exitCode !== 0) throw new Error("claude CLI not found on PATH (npm install -g @anthropic-ai/claude-code)");
    if (!existsSync(join(STAGE, ".claude-plugin", "plugin.json"))) throw new Error(`no staged build at ${STAGE}`);
    if (!process.env.ANTHROPIC_API_KEY && credentialLinks().length === 0) {
      throw new Error("no Anthropic credentials: set ANTHROPIC_API_KEY or log in with `claude`");
    }
  },
  variants: [variant("unified", "unified"), variant("directional", "directional")],
};
