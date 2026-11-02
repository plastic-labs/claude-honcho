// The contract between the harness-agnostic driver (run.ts, assert.ts) and a
// harness adapter (harnesses/*.ts). An adapter knows how to configure and
// invoke one harness and where that harness records its transcript; it knows
// nothing about what the driver asserts.

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
  log: (msg: string) => void;
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
}

export interface HarnessVariant {
  /** Short label, used in workspace ids and output. */
  name: string;
  /** Write config and run the scripted conversation to completion, including
   *  any asynchronous uploads the harness performs after a turn ends. */
  run(ctx: RunContext): Promise<{ expect: Expectation; result: HarnessRun }>;
}

export interface HarnessAdapter {
  name: string;
  /** Fail fast, before the sandbox is started, if the harness cannot run here
   *  (missing binary, missing credentials). */
  preflight(): Promise<void>;
  variants: HarnessVariant[];
}
