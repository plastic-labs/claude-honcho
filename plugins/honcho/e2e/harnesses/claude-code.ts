import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { startAnthropicMock, type AnthropicMock, type Block } from "../anthropic-mock.js";
import {
  SANDBOX_API_KEY,
  type Expectation,
  type HarnessAdapter,
  type HarnessVariant,
  type MockAttestation,
  type ModelMode,
  type RunContext,
  type Turn,
} from "../harness.js";
import { BACKGROUND_COMMAND, FOREGROUND_COMMAND, RECALL_PROMPT } from "../scenario.js";

// Claude Code with this plugin loaded from the staged release build (.stage/,
// what users install). Everything harness-specific lives here: the plugin's
// config file, how `claude` is launched and driven, where its transcript is,
// and the scripted model it talks to.
//
// Isolation: `claude` runs with HOME pointed at the run dir, so neither the
// developer's ~/.honcho config nor their ~/.claude settings and plugins are
// read.
//
// Model (ctx.model):
// - "mock": a scripted Anthropic API on localhost (claudeCodeScript below).
//   CLAUDE_CONFIG_DIR is also isolated and ANTHROPIC_* are replaced, so no
//   stored login can reach the real API, and no credential store is linked.
// - "real": a real model (Haiku by default). ANTHROPIC_API_KEY when set,
//   otherwise the CLI's own login, by linking only its credential store into the
//   isolated HOME (the login keychain on macOS, ~/.claude/.credentials.json on
//   Linux). No credential is read or copied by this script.

const STAGE = join(import.meta.dir, "..", "..", ".stage");
const MODEL = process.env.E2E_CLAUDE_MODEL || "claude-haiku-5-5";
/** The only model id the mock answers to; claude is launched with it in mock mode. */
const MOCK_MODEL = "claude-haiku-5-5";
const AI_PEER = "claude"; // the plugin's default AI peer, deliberately left unset in config

const TURN_TIMEOUT_MS = 180_000;
const HOOK_SETTLE_TIMEOUT_MS = 60_000;
/** No new hook may start for this long before stdin is closed. */
const HOOK_QUIET_MS = 1_500;
const POLL_MS = 100;

type Event = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function credentialLinks(): Array<[target: string, link: string]> {
  if (process.env.ANTHROPIC_API_KEY) return [];
  if (process.platform === "darwin") return [[join(homedir(), "Library", "Keychains"), join("Library", "Keychains")]];
  // Linux: if the CLI rotates its token with an atomic rename, the link becomes
  // a plain file inside the run dir and the rotated token stays there, so the
  // real file goes stale. Prefer ANTHROPIC_API_KEY on Linux.
  const file = join(homedir(), ".claude", ".credentials.json");
  return existsSync(file) ? [[file, join(".claude", ".credentials.json")]] : [];
}

/** The parent environment minus anything that would leak the caller's Claude
 *  Code session (nested-session markers, provider switches) or Honcho config
 *  (HONCHO_* overrides), plus `extra`. In mock mode ANTHROPIC_* are dropped too,
 *  so only the mock's URL and key remain. */
function harnessEnv(model: ModelMode, home: string, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("HONCHO_") || k.startsWith("CLAUDE_CODE_")) continue;
    if (k === "CLAUDECODE" || k === "CLAUDE_PID" || k === "CLAUDE_EFFORT" || k === "CLAUDE_CONFIG_DIR") continue;
    if (model === "mock" && k.startsWith("ANTHROPIC_")) continue;
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
export const MOCK_RECALL_REPLY = "I remember a few things about your setup.";

const CONVERSATION_STEPS = ["turn1/0", "turn2/0", "turn2/1", "turn2/2", "wakeup/0", "wakeup/1"];
const RECALL_STEPS = ["recall/0"];

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
    recall: () => [{ type: "text", text: MOCK_RECALL_REPLY }],
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
      const name = text.includes(RECALL_PROMPT) ? "recall"
        : text.includes("<task-notification>") ? "wakeup"
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

/** Count the scripted /v1/messages calls the mock answered since `from`, and
 *  report anything it did not expect. Each step must be served exactly once
 *  for the count to match. */
function attest(mock: AnthropicMock, from: number, steps: string[], log: (msg: string) => void): MockAttestation {
  const requests = mock.requests.slice(from);
  for (const r of requests) {
    if (!steps.includes(r.note) && r.note !== "hello" && r.note !== "count_tokens") log(`anthropic mock: ${r.note} ${r.method} ${r.path}`);
  }
  const served = requests.filter((r) => r.path === "/v1/messages" && steps.includes(r.note)).map((r) => r.note);
  const each = steps.every((s) => served.filter((n) => n === s).length === 1);
  return { expectedCalls: steps.length, servedCalls: each ? served.length : 0 };
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
   *  back and none has started for HOOK_QUIET_MS. Uploads run in async hooks;
   *  closing stdin before they finish makes `claude -p` cancel them. */
  async settleHooks(): Promise<void> {
    const deadline = Date.now() + HOOK_SETTLE_TIMEOUT_MS;
    let lastStarted = -1;
    let quietSince = Date.now();
    for (;;) {
      const startedEvents = this.events.filter((e) => e.subtype === "hook_started");
      if (startedEvents.length !== lastStarted) {
        lastStarted = startedEvents.length;
        quietSince = Date.now();
      }
      const pending = new Set(startedEvents.map((e) => e.hook_id));
      for (const e of this.events) if (e.subtype === "hook_response") pending.delete(e.hook_id);
      if (pending.size === 0 && Date.now() - quietSince >= HOOK_QUIET_MS) return;
      if (Date.now() > deadline) throw new Error(`claude-code: ${pending.size} hook(s) never finished (see ${this.file})`);
      await sleep(POLL_MS);
    }
  }
}

const isResult = (e: Event) => e.type === "result";
const isWakeup = (e: Event) => e.type === "system" && e.subtype === "task_notification";

interface Conversation {
  replies: string[];
  sessionId: string;
  events: Event[];
  artifacts: string[];
}

async function converse(
  ctx: RunContext,
  turns: Turn[],
  label: string,
  env: Record<string, string>,
  cwd: string,
): Promise<Conversation> {
  const streamFile = join(ctx.runDir, `claude-${label}-stream.jsonl`);
  const stderrFile = join(ctx.runDir, `claude-${label}-stderr.txt`);
  const proc = Bun.spawn(
    [
      "claude", "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-hook-events",
      "--model", ctx.model === "mock" ? MOCK_MODEL : MODEL,
      "--plugin-dir", STAGE,
      "--permission-mode", "bypassPermissions",
    ],
    { cwd, env, stdin: "pipe", stdout: "pipe", stderr: Bun.file(stderrFile) },
  );
  ctx.onCleanup(() => proc.kill());
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
    for (const [n, turn] of turns.entries()) {
      const from = log.events.length;
      ctx.log(`${label} turn ${n + 1}: sending prompt`);
      send(turn);
      const done = await log.waitFor(from, isResult, `${label} turn ${n + 1} result`);
      takeResult(done);
      if (turn.expectsWakeup) {
        const wake = await log.waitFor(from, isWakeup, `${label} turn ${n + 1} background task notification`);
        takeResult(await log.waitFor(Math.max(wake, done + 1), isResult, `${label} turn ${n + 1} wakeup result`));
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
  return { replies, sessionId: String(init?.session_id ?? ""), events: log.events, artifacts: [streamFile, stderrFile] };
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

      const userPeer = `e2e-user-${ctx.runId}`;
      writeFileSync(
        join(home, ".honcho", "config.json"),
        JSON.stringify({
          apiKey: SANDBOX_API_KEY,
          peerName: userPeer,
          endpoint: { baseUrl: ctx.baseUrl },
          hosts: { claude_code: { workspace: ctx.workspace, observationMode } },
        }, null, 2),
      );

      let env: Record<string, string>;
      let configDir: string;
      let mock: AnthropicMock | undefined;
      const mockLog = join(ctx.runDir, "anthropic-mock.jsonl");
      if (ctx.model === "mock") {
        configDir = join(ctx.runDir, "claude-config");
        mkdirSync(configDir, { recursive: true });
        const started = startAnthropicMock(claudeCodeScript(ctx.turns), mockLog);
        mock = started;
        ctx.onCleanup(() => started.stop());
        env = harnessEnv(ctx.model, home, {
          CLAUDE_CONFIG_DIR: configDir,
          ANTHROPIC_BASE_URL: started.url,
          ANTHROPIC_API_KEY: "sk-ant-e2e-mock",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        });
        ctx.log(`claude-code: model mock at ${started.url}`);
      } else {
        configDir = join(home, ".claude");
        env = harnessEnv(ctx.model, home, {});
        ctx.log(`claude-code: model ${MODEL}`);
      }

      // The plugin's SessionStart version check asks the npm registry for the
      // latest release at most once a day, skipping while this stamp is fresh.
      // A fresh config dir has no stamp, so without it every session would
      // reach the network, which the run is meant not to do.
      const pluginData = join(configDir, "plugins", "data", "honcho-inline");
      mkdirSync(pluginData, { recursive: true });
      writeFileSync(join(pluginData, ".version-check"), "");

      // Each harness session gets the credential links only while it runs.
      // They are removed when it exits (or by cleanup on a signal), so nothing
      // that later cleans up or archives the run dir can reach the store.
      const session = async (turns: Turn[], label: string): Promise<Conversation> => {
        const links: string[] = [];
        const unlink = () => {
          while (links.length) {
            try {
              unlinkSync(links.pop()!);
            } catch {
              // Already gone.
            }
          }
        };
        ctx.onCleanup(unlink);
        try {
          if (ctx.model === "real") {
            for (const [target, link] of credentialLinks()) {
              mkdirSync(join(home, link, ".."), { recursive: true });
              symlinkSync(target, join(home, link));
              links.push(join(home, link));
            }
          }
          return await converse(ctx, turns, label, env, cwd);
        } finally {
          unlink();
        }
      };

      const mockFrom = mock?.requests.length ?? 0;
      const conversation = await session(ctx.turns, "main");
      const artifacts = [...conversation.artifacts, ...(mock ? [mockLog] : [])];
      let attestation: MockAttestation | undefined;
      if (mock) {
        attestation = attest(mock, mockFrom, CONVERSATION_STEPS, ctx.log);
        // The scripted texts must also be what came back; anything else means
        // some other model answered.
        const r = conversation.replies;
        if (!(r.length === 3 && r[0] === MOCK_REPLY_1 && r[1] === MOCK_REPLY_2 && r[2].startsWith(MOCK_WAKEUP_PREFIX))) {
          attestation = { ...attestation, servedCalls: 0 };
          ctx.log(`claude-code: replies are not the scripted ones: ${JSON.stringify(r)}`);
        }
        ctx.log(`anthropic mock served ${attestation.servedCalls}/${attestation.expectedCalls} scripted conversation calls`);
      }

      const transcript = transcriptUserTexts(configDir, conversation.sessionId);
      const honchoLogs = ["activity.log", "verbose.log"].map((f) => join(home, ".honcho", f)).filter((f) => existsSync(f));
      artifacts.push(...honchoLogs, ...(transcript.file ? [transcript.file] : []));

      // Each chat is its own Honcho session, named after the Claude Code session id.
      const expect: Expectation = {
        session: conversation.sessionId,
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
        recallPair: observationMode === "unified" ? [userPeer, userPeer] : [AI_PEER, userPeer],
        decoyPair: observationMode === "unified" ? [AI_PEER, userPeer] : [userPeer, userPeer],
      };

      return {
        expect,
        result: {
          assistantReplies: conversation.replies,
          transcriptUserTexts: transcript.texts,
          artifacts,
          mock: attestation,
        },
        // A new `claude` process in the same HOME and project: SessionStart and
        // UserPromptSubmit fetch memory exactly as they would for the user.
        async recall(prompt) {
          const from = mock?.requests.length ?? 0;
          const recallRun = await session([{ prompt }], "recall");
          if (mock) {
            const request = mock.requests.slice(from).find((r) => r.note === "recall/0");
            return {
              modelInput: JSON.stringify(request?.body ?? ""),
              artifacts: [...recallRun.artifacts, mockLog],
              mock: attest(mock, from, RECALL_STEPS, ctx.log),
            };
          }
          // Real mode: there is no request to inspect, so use what the hooks
          // emitted for injection.
          const hookOutput = recallRun.events
            .filter((e) => e.subtype === "hook_response")
            .map((e) => String(e.output ?? ""))
            .join("\n");
          return { modelInput: hookOutput, artifacts: recallRun.artifacts };
        },
      };
    },
  };
}

export const claudeCode: HarnessAdapter = {
  name: "claude-code",
  async preflight(model) {
    const version = Bun.spawnSync(["claude", "--version"], { stderr: "pipe" });
    if (version.exitCode !== 0) throw new Error("claude CLI not found on PATH (npm install -g @anthropic-ai/claude-code)");
    if (!existsSync(join(STAGE, ".claude-plugin", "plugin.json"))) throw new Error(`no staged build at ${STAGE}`);
    if (model === "real" && !process.env.ANTHROPIC_API_KEY && credentialLinks().length === 0) {
      throw new Error("no Anthropic credentials: set ANTHROPIC_API_KEY or log in with `claude`");
    }
  },
  variants: [variant("unified", "unified"), variant("directional", "directional")],
};
