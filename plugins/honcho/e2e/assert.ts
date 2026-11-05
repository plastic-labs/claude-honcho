import { Honcho, type Message } from "@honcho-ai/sdk";
import { SANDBOX_API_KEY, type Expectation, type HarnessRun, type MockAttestation, type ModelMode, type RecallRun, type Turn } from "./harness.js";
import { BACKGROUND_MARKER, commandOutputMarkers, RECALL_PROMPT, recallProbes } from "./scenario.js";

// Harness-agnostic assertions over what a harness integration wrote to Honcho.
//
// Mock-provider caveats (honcho sandbox/README.md) shape what is asserted:
// derived conclusion text is synthetic and always `explicit`, so conclusions are
// asserted to exist for the right (observer, observed) pair, never on content
// or level. Mock embeddings carry no similarity, so nothing here relies on
// vector ranking: message search is not asserted, and recall is checked with
// uniquely-texted conclusions written into two collections, by exact
// containment in the context and in what the integration hands the model.

const LAND_TIMEOUT_MS = 60_000;
const DRAIN_TIMEOUT_MS = 180_000;
const POLL_MS = 500;

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AssertOptions {
  baseUrl: string;
  workspace: string;
  runId: string;
  turns: Turn[];
  model: ModelMode;
  log: (msg: string) => void;
}

type Check = (name: string, ok: boolean, detail?: string) => void;

function collector(): { results: CheckResult[]; check: Check } {
  const results: CheckResult[] = [];
  return { results, check: (name, ok, detail) => results.push({ name, ok, detail: ok ? undefined : detail }) };
}

const client = (opts: AssertOptions) => new Honcho({ apiKey: SANDBOX_API_KEY, baseURL: opts.baseUrl, workspaceId: opts.workspace });

/** Mock mode is only meaningful if the model really was the mock. */
function checkMockAttestation(check: Check, model: ModelMode, what: string, mock?: MockAttestation): void {
  if (model !== "mock") return;
  check(
    `mock model served every scripted call of the ${what}`,
    !!mock && mock.expectedCalls > 0 && mock.servedCalls === mock.expectedCalls,
    mock ? `served ${mock.servedCalls}/${mock.expectedCalls}` : "the adapter reported no mock attestation",
  );
}

async function contextText(honcho: Honcho, [observer, observed]: [string, string]): Promise<string> {
  const peer = await honcho.peer(observer);
  const ctx = await peer.context({ ...(observer === observed ? {} : { target: observed }), maxConclusions: 100 });
  return ctx.representation ?? "";
}

async function allMessages(honcho: Honcho, sessionId: string): Promise<Message[]> {
  const session = await honcho.session(sessionId);
  const out: Message[] = [];
  for await (const m of await session.messages()) out.push(m);
  return out;
}

async function sessionIds(honcho: Honcho): Promise<string[]> {
  const ids: string[] = [];
  for await (const s of await honcho.sessions()) ids.push(s.id);
  return ids;
}

async function conclusionContents(honcho: Honcho, observer: string, observed: string): Promise<string[]> {
  const peer = await honcho.peer(observer);
  const page = await peer.conclusionsOf(observed).list({ size: 100 });
  return page.items.map((c) => c.content);
}

/** Uploads are asynchronous in most integrations, so wait until every scripted
 *  prompt and every assistant reply has landed (or the timeout passes) before
 *  judging; the checks then report exactly what is missing. */
async function waitForUploads(honcho: Honcho, expect: Expectation, turns: Turn[], run: HarnessRun): Promise<void> {
  const deadline = Date.now() + LAND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await sessionIds(honcho)).includes(expect.session)) {
      const msgs = await allMessages(honcho, expect.session);
      const user = msgs.filter((m) => m.peerId === expect.userPeer).map((m) => m.content);
      const ai = new Set(msgs.filter((m) => m.peerId === expect.aiPeer).map((m) => m.content.trim()));
      if (turns.every((t) => user.includes(t.prompt)) && run.assistantReplies.every((r) => ai.has(r.trim()))) return;
    }
    await sleep(POLL_MS);
  }
}

/** Block until the workspace's deriver queue is empty after having done work.
 *  An empty queue that never had work looks the same as a drained one, so
 *  zero completed units keeps waiting rather than passing. */
async function waitForDeriver(honcho: Honcho): Promise<string> {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let last = await honcho.queueStatus();
  while (Date.now() < deadline) {
    if (last.pendingWorkUnits + last.inProgressWorkUnits === 0 && last.completedWorkUnits > 0) {
      return `drained (${last.completedWorkUnits} work units)`;
    }
    await sleep(POLL_MS);
    last = await honcho.queueStatus();
  }
  return `did not drain in ${DRAIN_TIMEOUT_MS / 1000}s: ${JSON.stringify(last)}`;
}

export async function assertRoundTrip(opts: AssertOptions, expect: Expectation, run: HarnessRun): Promise<CheckResult[]> {
  const { turns, log } = opts;
  const honcho = client(opts);
  const { results, check } = collector();
  const prompts = turns.map((t) => t.prompt);

  checkMockAttestation(check, opts.model, "conversation", run.mock);

  // The harness itself must have injected a task notification, or the
  // negative assertions below would pass vacuously.
  const injected = run.transcriptUserTexts.filter((t) => !prompts.includes(t));
  check(
    "harness injected a <task-notification> into the conversation",
    injected.some((t) => t.includes("<task-notification>")),
    `transcript user entries: ${JSON.stringify(run.transcriptUserTexts)}`,
  );
  check(
    "the model saw the background command's output",
    run.assistantReplies.some((r) => r.includes(BACKGROUND_MARKER)),
    `no assistant reply mentions ${BACKGROUND_MARKER}: ${JSON.stringify(run.assistantReplies)}`,
  );

  log("waiting for uploads to land");
  await waitForUploads(honcho, expect, turns, run);

  // Sessions: exactly the one the integration names, never an extra or empty one.
  const sessions = await sessionIds(honcho);
  check(
    `workspace holds exactly the session ${expect.session}`,
    sessions.length === 1 && sessions[0] === expect.session,
    `sessions: ${JSON.stringify(sessions)}`,
  );
  if (!sessions.includes(expect.session)) return results;

  const session = await honcho.session(expect.session);
  const msgs = await allMessages(honcho, expect.session);
  const userMsgs = msgs.filter((m) => m.peerId === expect.userPeer).map((m) => m.content);
  const aiMsgs = msgs.filter((m) => m.peerId === expect.aiPeer).map((m) => m.content.trim());

  // Messages landed on the right peers.
  const strangers = msgs.filter((m) => m.peerId !== expect.userPeer && m.peerId !== expect.aiPeer);
  check(
    "every message belongs to the user or the AI peer",
    strangers.length === 0,
    `unexpected authors: ${JSON.stringify(strangers.map((m) => [m.peerId, m.content.slice(0, 80)]))}`,
  );
  for (const [i, prompt] of prompts.entries()) {
    const n = userMsgs.filter((c) => c === prompt).length;
    check(`turn ${i + 1} prompt landed once on ${expect.userPeer}`, n === 1, `found ${n} copies`);
  }
  for (const [i, reply] of run.assistantReplies.entries()) {
    const n = aiMsgs.filter((c) => c === reply.trim()).length;
    check(`model turn ${i + 1} reply landed once on ${expect.aiPeer}`, n === 1, `found ${n} copies of ${JSON.stringify(reply)}`);
  }
  const duplicated = aiMsgs.filter((c, i) => aiMsgs.indexOf(c) !== i);
  check("no assistant message was uploaded twice", duplicated.length === 0, `duplicates: ${JSON.stringify(duplicated)}`);
  // The AI peer may legitimately describe a notification, but never carry the raw envelope.
  const aiEnvelopes = aiMsgs.filter((c) => c.includes("<task-notification>"));
  check(
    "no <task-notification> envelope was uploaded as the AI peer",
    aiEnvelopes.length === 0,
    `found: ${JSON.stringify(aiEnvelopes)}`,
  );

  // Negative: nothing the harness injected is stored as the user speaking.
  const unscripted = userMsgs.filter((c) => !prompts.includes(c));
  check(
    "user messages are exactly the scripted prompts",
    unscripted.length === 0,
    `unscripted user messages: ${JSON.stringify(unscripted)}`,
  );
  const leaked = userMsgs.filter((c) => injected.some((t) => c.includes(t.trim())) || commandOutputMarkers.some((m) => c.includes(m)));
  check(
    "no harness-injected content or command output was uploaded as the user",
    leaked.length === 0,
    `leaked: ${JSON.stringify(leaked)}`,
  );

  // Topology: who observes whom, as the server reports it.
  const actualPeers = (await session.peers()).map((p) => p.id).sort();
  const expectedPeers = Object.keys(expect.topology).sort();
  check(
    "session peers are exactly the user and AI peers",
    JSON.stringify(actualPeers) === JSON.stringify(expectedPeers),
    `got ${JSON.stringify(actualPeers)}, want ${JSON.stringify(expectedPeers)}`,
  );
  for (const [peerId, want] of Object.entries(expect.topology)) {
    // A session-level value of null inherits the peer-level setting, which in
    // turn defaults to observe_me=true; observe_others has no peer-level form.
    const sessionCfg = await session.getPeerConfiguration(peerId);
    const peerCfg = await (await honcho.peer(peerId)).getConfiguration();
    const got = {
      observeMe: sessionCfg.observeMe ?? peerCfg.observeMe ?? true,
      observeOthers: sessionCfg.observeOthers ?? false,
    };
    check(
      `${peerId} topology is observe_me=${want.observeMe} observe_others=${want.observeOthers}`,
      got.observeMe === want.observeMe && got.observeOthers === want.observeOthers,
      `got ${JSON.stringify(got)} (session ${JSON.stringify(sessionCfg)}, peer ${JSON.stringify(peerCfg)})`,
    );
  }

  // Derivation, then recall through the context call the integration reads.
  log("waiting for the deriver");
  const drained = await waitForDeriver(honcho);
  check("deriver queue drained", drained.startsWith("drained"), drained);
  log(`deriver ${drained}`);

  for (const [observer, observed] of expect.derivedPairs) {
    const contents = await conclusionContents(honcho, observer, observed);
    check(`conclusions derived for ${observer} -> ${observed}`, contents.length > 0, "none");
  }
  for (const [observer, observed] of expect.emptyPairs) {
    const contents = await conclusionContents(honcho, observer, observed);
    check(`no conclusions for ${observer} -> ${observed}`, contents.length === 0, `found ${contents.length}`);
  }

  return results;
}

/**
 * Recall, after the round trip: write a uniquely-texted conclusion into the
 * collection the integration reads (`probe`) and another into a different
 * collection about the same user (`decoy`). Mock-derived text is the same
 * placeholder in every collection, so only unique text can show which
 * collection a context came from. Checked twice: through the API, and through
 * the integration itself, by starting a fresh harness session and looking at
 * what it put in front of the model.
 */
export async function assertRecall(
  opts: AssertOptions,
  expect: Expectation,
  recall: (prompt: string) => Promise<RecallRun>,
): Promise<{ checks: CheckResult[]; artifacts: string[] }> {
  const honcho = client(opts);
  const { results, check } = collector();
  const { probe, decoy } = recallProbes(opts.runId);
  const [po, pd] = expect.recallPair;
  const [dob, dd] = expect.decoyPair;

  await (await honcho.peer(po)).conclusionsOf(pd).create({ content: probe, sessionId: expect.session });
  await (await honcho.peer(dob)).conclusionsOf(dd).create({ content: decoy, sessionId: expect.session });

  const probeCtx = await contextText(honcho, expect.recallPair);
  const decoyCtx = await contextText(honcho, expect.decoyPair);
  check(
    `${po} -> ${pd} context holds its own probe and not the decoy`,
    probeCtx.includes(probe) && !probeCtx.includes(decoy),
    `context: ${JSON.stringify(probeCtx.slice(0, 600))}`,
  );
  check(
    `${dob} -> ${dd} context holds the decoy and not the probe`,
    decoyCtx.includes(decoy) && !decoyCtx.includes(probe),
    `context: ${JSON.stringify(decoyCtx.slice(0, 600))}`,
  );

  opts.log("recall: starting a fresh harness session");
  const run = await recall(RECALL_PROMPT);
  checkMockAttestation(check, opts.model, "recall session", run.mock);
  check(
    `the integration put the ${po} -> ${pd} probe in front of the model`,
    run.modelInput.includes(probe),
    `probe ${JSON.stringify(probe)} not found in ${run.modelInput.length} chars of model input`,
  );
  check(
    `the integration kept the ${dob} -> ${dd} decoy away from the model`,
    !run.modelInput.includes(decoy),
    `decoy ${JSON.stringify(decoy)} reached the model`,
  );
  return { checks: results, artifacts: run.artifacts };
}
