import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { startAnthropicMock, type AnthropicMock, type Block } from "../anthropic-mock.js";
import type { Expectation, HarnessAdapter, HarnessRun, HarnessVariant, RunContext, Turn } from "../harness.js";
import { BACKGROUND_COMMAND, FOREGROUND_COMMAND } from "../scenario.js";

// Claude Code with this plugin loaded from the staged release build (.stage/,
// what users install). Everything harness-specific lives here: the plugin's
// config file, how `claude` is launched and driven, where its transcript is,
// and the scripted model it talks to.
//
// Isolation: `claude` runs with HOME pointed at the run dir, so neither the
// developer's ~/.honcho config nor their ~/.claude settings and plugins are
// read.
//
// Model (`--model mock|real`, or E2E_MODEL):
// - "mock" (default): a scripted Anthropic API on localhost (claudeCodeScript
//   below). CLAUDE_CONFIG_DIR is also isolated and ANTHROPIC_* are replaced, so
//   no stored login can reach the real API; the run then checks that every
//   scripted step was served by the mock.
// - "real": a real model (Haiku by default). ANTHROPIC_API_KEY when set,
//   otherwise the CLI's own login, by linking only its credential store into the
//   isolated HOME (the login keychain on macOS, ~/.claude/.credentials.json on
//   Linux). No credential is read or copied by this script.

const STAGE = join(import.meta.dir, "..", "..", ".stage");
const MODEL = process.env.E2E_CLAUDE_MODEL || "claude-haiku-5-5";
/** The only model id the mock answers to; claude is launched with it in mock mode. */
const MOCK_MODEL = "claude-haiku-5-5";
const modelMode = (): "mock" | "real" => (process.env.E2E_MODEL === "real" ? "real" : "mock");
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
 *  Code session (nested-session markers, provider switches) or Honcho config
 *  (HONCHO_* overrides), plus `extra`. In mock mode ANTHROPIC_* are dropped too,
 *  so only the mock's URL and key remain. */
function harnessEnv(home: string, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("HONCHO_") || k.startsWith("CLAUDE_CODE_")) continue;
    if (k === "CLAUDECODE" || k === "CLAUDE_PID" || k === "CLAUDE_EFFORT" || k === "CLAUDE_CONFIG_DIR") continue;
    if (modelMode() === "mock" && k.startsWith("ANTHROPIC_")) continue;
    env[k] = v;
  }
  return { ...env, ...extra, HOME: home };
}

// ---------------------------------------------------------------------------
// The scripted model
//
// Stateless: each /v1/messages request carries the whole conversation, so the
// reply is chosen from the latest user message that holds a scripted prompt or
// a task notification, plus how many tool calls have been made since it. The
// tools are real Claude Code tools, so the command output and the
// <task-notification> the plugin sees are produced by Claude Code itself.
// ---------------------------------------------------------------------------

export const MOCK_REPLY_1 = "Noted: Quackenbush is on debugging duty.";
export const MOCK_REPLY_2 = "Both commands are running; I will report the background output when it finishes.";
export const MOCK_WAKEUP_PREFIX = "The background command printed:";

type Msg = { role: string; content: string | Array<Record<string, any>> };

function textOf(content: Msg["content"]): string {
  if (typeof content === "string") return content;
  return content.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
}

// Claude Code may append non-user messages after the tool result, so search
// back for it rather than reading the last message.
function lastToolResultText(messages: Msg[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    const result = Array.isArray(content) ? content.find((b) => b.type === "tool_result") : undefined;
    if (result) return typeof result.content === "string" ? result.content : textOf(result.content ?? []);
  }
  return "";
}

function claudeCodeScript(turns: Turn[]): (body: any) => { blocks: Block[]; note: string } {
  const scripts: Record<string, (messages: Msg[], trigger: string) => Block[]> = {
    turn1: () => [{ type: "text", text: MOCK_REPLY_1 }],
    turn2: () => [
      { type: "tool_use", name: "Bash", input: { command: FOREGROUND_COMMAND, description: "Print the foreground marker" } },
      { type: "tool_use", name: "Bash", input: { command: BACKGROUND_COMMAND, description: "Print the background marker later", run_in_background: true } },
      { type: "text", text: MOCK_REPLY_2 },
    ],
    // Read the output file the notification names, then repeat what it holds.
    wakeup: (messages, trigger) => [
      { type: "tool_use", name: "Read", input: { file_path: trigger.match(/<output-file>(.*?)<\/output-file>/)?.[1] ?? "" } },
      { type: "text", text: `${MOCK_WAKEUP_PREFIX} ${lastToolResultText(messages).trim()}` },
    ],
  };

  return (body) => {
    // Side requests (titles, summaries) carry no tools.
    if (!Array.isArray(body?.tools) || !body.tools.some((t: any) => t.name === "Bash")) {
      return { blocks: [{ type: "text", text: "ok" }], note: "side request" };
    }
    if (body.model !== MOCK_MODEL) {
      return { blocks: [{ type: "text", text: "ok" }], note: `unscripted model ${body.model}` };
    }
    const messages: Msg[] = body.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "user") continue;
      const text = textOf(messages[i].content);
      const name = text.includes("<task-notification>") ? "wakeup"
        : text.includes(turns[1].prompt) ? "turn2"
        : text.includes(turns[0].prompt) ? "turn1"
        : null;
      if (!name) continue;
      const step = messages.slice(i + 1)
        .filter((m) => m.role === "assistant" && Array.isArray(m.content))
        .reduce((n, m) => n + (m.content as Array<Record<string, any>>).filter((b) => b.type === "tool_use").length, 0);
      // One block per response, so every step is its own request.
      const block = scripts[name](messages, text)[step];
      if (!block) return { blocks: [{ type: "text", text: "done" }], note: `${name}/exhausted` };
      return { blocks: [block], note: `${name}/${step}` };
    }
    return { blocks: [{ type: "text", text: "ok" }], note: "unscripted" };
  };
}

const SCRIPTED_STEPS = ["turn1/0", "turn2/0", "turn2/1", "turn2/2", "wakeup/0", "wakeup/1"];

/** A mock-mode run that reached the real API would still pass the Honcho
 *  checks, so refuse it unless the mock served each scripted step exactly once
 *  (six /v1/messages calls) and the replies are the scripted ones. */
function verifyMockServed(mock: AnthropicMock, replies: string[], log: (msg: string) => void): void {
  const odd = mock.requests.filter((r) => !SCRIPTED_STEPS.includes(r.note) && r.note !== "hello" && r.note !== "count_tokens");
  for (const r of odd) log(`anthropic mock: ${r.note} ${r.method} ${r.path}`);

  const scriptedCalls = mock.requests.filter((r) => r.path === "/v1/messages" && SCRIPTED_STEPS.includes(r.note)).map((r) => r.note);
  const counts = SCRIPTED_STEPS.map((step) => `${step}x${scriptedCalls.filter((n) => n === step).length}`);
  const servedOnce = scriptedCalls.length === SCRIPTED_STEPS.length && SCRIPTED_STEPS.every((step) => scriptedCalls.includes(step));
  const scripted =
    replies.length === 3 && replies[0] === MOCK_REPLY_1 && replies[1] === MOCK_REPLY_2 && replies[2].startsWith(MOCK_WAKEUP_PREFIX);
  if (!servedOnce || !scripted) {
    throw new Error(
      `claude-code: mock mode, but the conversation did not come from the mock ` +
        `(scripted /v1/messages calls: ${counts.join(" ")}; replies: ${JSON.stringify(replies)})`,
    );
  }
  log(`anthropic mock served ${scriptedCalls.length}/${SCRIPTED_STEPS.length} scripted /v1/messages calls`);
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

async function converse(ctx: RunContext, env: Record<string, string>, cwd: string): Promise<{ replies: string[]; sessionId: string; artifacts: string[] }> {
  const streamFile = join(ctx.runDir, "claude-stream.jsonl");
  const stderrFile = join(ctx.runDir, "claude-stderr.txt");
  const proc = Bun.spawn(
    [
      "claude", "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-hook-events",
      "--model", modelMode() === "mock" ? MOCK_MODEL : MODEL,
      "--plugin-dir", STAGE,
      "--permission-mode", "bypassPermissions",
    ],
    { cwd, env, stdin: "pipe", stdout: "pipe", stderr: Bun.file(stderrFile) },
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
function transcriptUserTexts(configDir: string, sessionId: string): { texts: string[]; file?: string } {
  const projects = join(configDir, "projects");
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
      const mode = modelMode();

      let env: Record<string, string>;
      let configDir: string;
      let mock: AnthropicMock | undefined;
      let links: string[] = [];
      if (mode === "mock") {
        configDir = join(ctx.runDir, "claude-config");
        mkdirSync(configDir, { recursive: true });
        mock = startAnthropicMock(claudeCodeScript(ctx.turns), join(ctx.runDir, "anthropic-mock.jsonl"));
        env = harnessEnv(home, {
          CLAUDE_CONFIG_DIR: configDir,
          ANTHROPIC_BASE_URL: mock.url,
          ANTHROPIC_API_KEY: "sk-ant-e2e-mock",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        });
      } else {
        configDir = join(home, ".claude");
        links = credentialLinks().map(([target, link]) => {
          mkdirSync(join(home, link, ".."), { recursive: true });
          symlinkSync(target, join(home, link));
          return join(home, link);
        });
        env = harnessEnv(home, {});
      }
      ctx.log(`claude-code: model ${mode === "mock" ? `mock at ${mock!.url}` : MODEL}`);

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
        conversation = await converse(ctx, env, cwd);
      } finally {
        for (const link of links) unlinkSync(link);
        mock?.stop();
      }
      const { replies, sessionId, artifacts } = conversation;
      if (mock) {
        artifacts.push(join(ctx.runDir, "anthropic-mock.jsonl"));
        verifyMockServed(mock, replies, ctx.log);
      }
      const transcript = transcriptUserTexts(configDir, sessionId);
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
    if (modelMode() === "real" && !process.env.ANTHROPIC_API_KEY && credentialLinks().length === 0) {
      throw new Error("no Anthropic credentials: set ANTHROPIC_API_KEY or log in with `claude`");
    }
  },
  variants: [variant("unified", "unified"), variant("directional", "directional")],
};
