// The contract between the harness-agnostic driver (run.ts, assert.ts) and a
// harness adapter (harnesses/*.ts). An adapter knows how to configure and
// invoke one harness, where that harness records its transcript, and how its
// model is mocked; it knows nothing about what the driver asserts.

/** The sandbox runs with auth off; any key is accepted. */
export const SANDBOX_API_KEY = "e2e-sandbox";

/** "mock": a scripted local model, free and deterministic (default, CI).
 *  "real": a real model, for checking the script still matches reality. */
export type ModelMode = "mock" | "real";

export interface Turn {
  /** Sent verbatim as a user prompt. */
  prompt: string;
  /** The turn starts background work whose completion the harness reports
   *  back on its own (e.g. a task notification), which runs another model
   *  turn. The adapter waits for that turn before moving on. */
  expectsWakeup?: boolean;
}

/** Who observes whom, as the server should report it for a session peer. */
export interface PeerTopology {
  observeMe: boolean;
  observeOthers: boolean;
}

/** What one variant of a harness configuration should produce in Honcho. */
export interface Expectation {
  /** The Honcho session the integration should write to. */
  session: string;
  userPeer: string;
  aiPeer: string;
  /** Effective session-peer configuration for each peer id. */
  topology: Record<string, PeerTopology>;
  /** (observer, observed) pairs that must end up with derived conclusions. */
  derivedPairs: Array<[observer: string, observed: string]>;
  /** (observer, observed) pairs that must stay empty under this topology. */
  emptyPairs: Array<[observer: string, observed: string]>;
  /** The peer card the integration injects at session start. */
  recallPair: [observer: string, observed: string];
  /** Another peer card about the same user that it must not inject. */
  decoyPair: [observer: string, observed: string];
}

export interface RunContext {
  /** Honcho API base URL (no /v3 suffix). */
  baseUrl: string;
  /** Fresh, unique per variant run. */
  workspace: string;
  /** Unique per run; safe to use in peer ids. */
  runId: string;
  /** Empty scratch directory owned by this variant run. Isolated HOME, working
   *  directory, logs: everything the harness touches goes under here. */
  runDir: string;
  turns: Turn[];
  model: ModelMode;
  /** Register teardown (kill child processes, stop servers, remove links).
   *  Runs when the variant ends and on SIGINT/SIGTERM, newest first. */
  onCleanup: (fn: () => void) => void;
  log: (msg: string) => void;
}

/** In mock mode, the adapter's proof that the model it talked to was the mock:
 *  how many scripted model calls the mock answered against how many the
 *  script has. A run that bypassed the mock cannot produce a match, and the
 *  driver fails any mock-mode run without one. */
export interface MockAttestation {
  expectedCalls: number;
  servedCalls: number;
}

export interface HarnessRun {
  /** The harness's final assistant reply for every model turn, in order,
   *  including turns the harness started on its own (wakeups). */
  assistantReplies: string[];
  /** Every user-role text entry in the harness's own transcript (tool results
   *  excluded). Entries that are not one of the scripted prompts are content
   *  the harness injected, which the integration must never upload as the user. */
  transcriptUserTexts: string[];
  /** Files worth keeping when a run fails (logs, raw event streams). */
  artifacts: string[];
  /** Required in mock mode. */
  mock?: MockAttestation;
}

export interface RecallRun {
  /** Everything the integration put in front of the model for the recall
   *  prompt. Mock mode: the model request itself. Real mode: what the
   *  integration's hooks emitted for injection. */
  modelInput: string;
  artifacts: string[];
  /** Required in mock mode. */
  mock?: MockAttestation;
}

export interface VariantRun {
  expect: Expectation;
  result: HarnessRun;
  /** Start a fresh harness session in the same workspace and identity, send
   *  `prompt` as its only turn, and report what reached the model. */
  recall: (prompt: string) => Promise<RecallRun>;
}

export interface HarnessVariant {
  /** Short label, used in workspace ids and output. */
  name: string;
  /** Write config and run the scripted conversation to completion, including
   *  any asynchronous uploads the harness performs after a turn ends. */
  run(ctx: RunContext): Promise<VariantRun>;
}

export interface HarnessAdapter {
  name: string;
  /** Fail fast, before the sandbox is started, if the harness cannot run here
   *  (missing binary, missing credentials in real mode). */
  preflight(model: ModelMode): Promise<void>;
  variants: HarnessVariant[];
}
