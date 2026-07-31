import { describe, expect, test } from "bun:test";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  dedupKey,
  filterRepeats,
  emitPerTurn,
  DEDUP_WINDOW_TURNS,
  DEDUP_FLOOR,
} from "../src/hooks/user-prompt";
import {
  pruneLedger,
  loadDedupLedger,
  clearSessionFiles,
  DEDUP_LEDGER_RETAIN_TURNS,
  type DedupLedger,
} from "../src/state";
import type { InjectionConfig } from "../src/config";

const ledger = (turn: number, seen: Record<string, number> = {}): DedupLedger => ({ turn, seen });

describe("dedupKey", () => {
  test("is stable for the same conclusion", () => {
    expect(dedupKey("Prefers concise answers", "u")).toBe(dedupKey("Prefers concise answers", "u"));
  });

  test("normalizes whitespace and case, so cosmetic re-rendering still counts as a repeat", () => {
    expect(dedupKey("  Prefers   CONCISE\nanswers ", "u")).toBe(dedupKey("prefers concise answers", "u"));
  });

  test("different conclusions get different keys", () => {
    expect(dedupKey("Prefers concise answers", "u")).not.toBe(dedupKey("Prefers verbose answers", "u"));
  });

  test("namespaces separate the user peer from the assistant peer", () => {
    expect(dedupKey("Prefers concise answers", "u")).not.toBe(dedupKey("Prefers concise answers", "a"));
  });
});

describe("filterRepeats", () => {
  test("first sight of a conclusion passes through untouched", () => {
    const l = ledger(1);
    const { kept, suppressed, floored } = filterRepeats(["a", "b", "c"], l, "u");
    expect(kept).toEqual(["a", "b", "c"]);
    expect(suppressed).toBe(0);
    expect(floored).toBe(false);
  });

  test("records what it emitted against the current turn", () => {
    const l = ledger(4);
    filterRepeats(["a", "b"], l, "u");
    expect(l.seen[dedupKey("a", "u")]).toBe(4);
    expect(l.seen[dedupKey("b", "u")]).toBe(4);
  });

  test("suppresses only the repeats, keeping genuinely new conclusions", () => {
    const l = ledger(1);
    filterRepeats(["a", "b"], l, "u");
    l.turn = 2;
    const { kept, suppressed, floored } = filterRepeats(["a", "b", "c"], l, "u");
    expect(kept).toEqual(["c"]);
    expect(suppressed).toBe(2);
    expect(floored).toBe(false);
  });

  test("a conclusion becomes eligible again once the window has passed", () => {
    const l = ledger(1);
    filterRepeats(["a"], l, "u");

    // Still inside the window, so "a" is suppressed BY THE WINDOW. "fresh" is a
    // new candidate and keeps the result non-empty, so the floor is not
    // involved here — see the floor tests below for that path.
    l.turn = 1 + DEDUP_WINDOW_TURNS;
    expect(filterRepeats(["a", "fresh"], l, "u").kept).toEqual(["fresh"]);

    // One turn past the window, measured from its LAST REAL injection (turn 1).
    l.turn = 1 + DEDUP_WINDOW_TURNS + 1;
    expect(filterRepeats(["a", "fresh2"], l, "u").kept).toEqual(["a", "fresh2"]);
  });

  test("being suppressed does NOT refresh the stamp — it ages out on schedule", () => {
    const l = ledger(1);
    filterRepeats(["a"], l, "u"); // real injection on turn 1

    // Suppressed on every turn in between; its stamp must stay at 1.
    for (let t = 2; t <= 1 + DEDUP_WINDOW_TURNS; t++) {
      l.turn = t;
      filterRepeats(["a", `new-${t}`], l, "u");
      expect(l.seen[dedupKey("a", "u")]).toBe(1);
    }

    // Therefore it recovers on schedule rather than being buried forever.
    l.turn = 1 + DEDUP_WINDOW_TURNS + 1;
    expect(filterRepeats(["a", "z"], l, "u").kept).toContain("a");
  });

  test("the user and assistant namespaces do not suppress each other", () => {
    const l = ledger(1);
    filterRepeats(["shared sentence"], l, "u");
    l.turn = 2;
    expect(filterRepeats(["shared sentence"], l, "a").kept).toEqual(["shared sentence"]);
  });

  describe("the never-empty floor", () => {
    test("an all-repeat turn still injects DEDUP_FLOOR conclusions, never zero", () => {
      const l = ledger(1);
      const all = ["a", "b", "c", "d", "e"];
      filterRepeats(all, l, "u");
      l.turn = 2;
      const { kept, suppressed, floored } = filterRepeats(all, l, "u");
      expect(kept).toEqual(["a", "b", "c"]); // top-N in retrieval (relevance) order
      expect(kept.length).toBe(DEDUP_FLOOR);
      expect(suppressed).toBe(all.length - DEDUP_FLOOR);
      expect(floored).toBe(true);
    });

    test("fewer candidates than the floor: all of them are re-emitted", () => {
      const l = ledger(1);
      filterRepeats(["only"], l, "u");
      l.turn = 2;
      expect(filterRepeats(["only"], l, "u").kept).toEqual(["only"]);
    });

    test("a non-empty retrieval NEVER yields an empty injection, across many turns", () => {
      const l = ledger(0);
      const all = ["a", "b", "c", "d", "e"];
      for (let t = 1; t <= 40; t++) {
        l.turn = t;
        const { kept } = filterRepeats(all, l, "u");
        expect(kept.length).toBeGreaterThan(0);
        expect(kept.length).toBeLessThanOrEqual(all.length);
      }
    });

    test("an empty retrieval stays empty — the floor invents nothing", () => {
      const l = ledger(1);
      const { kept, suppressed, floored } = filterRepeats([], l, "u");
      expect(kept).toEqual([]);
      expect(suppressed).toBe(0);
      expect(floored).toBe(false);
    });
  });
});

// Why loadDedupLedger validates `seen` values rather than only checking that
// `seen` is an object. filterRepeats does arithmetic on the stamp, so a value
// that will not coerce to a number poisons that entry permanently: the
// comparison is NaN > WINDOW, which is false (a repeat), and only KEPT entries
// are restamped — so a suppressed entry can never heal itself. No filesystem
// here; this pins the consequence the loader's guard exists to prevent.
describe("a non-numeric turn stamp would suppress a conclusion permanently", () => {
  test("NaN-producing stamp reads as a repeat at any distance", () => {
    const corrupt = { turn: 1, seen: { [dedupKey("a", "u")]: "abc" } } as unknown as DedupLedger;
    for (const turn of [2, 50, 100_000]) {
      corrupt.turn = turn;
      // "fresh" keeps the result non-empty so the floor cannot mask the effect.
      expect(filterRepeats(["a", "fresh"], corrupt, "u").kept).toEqual(["fresh"]);
    }
  });

  test("a valid numeric stamp does age out, by contrast", () => {
    const ok = ledger(1, { [dedupKey("a", "u")]: 1 });
    ok.turn = 1 + DEDUP_WINDOW_TURNS + 1;
    expect(filterRepeats(["a", "fresh"], ok, "u").kept).toEqual(["a", "fresh"]);
  });

  /**
   * The tests above hand a malformed ledger straight to filterRepeats, so they
   * pin the CONSEQUENCE but would stay green if the loader's validation were
   * deleted. These exercise loadDedupLedger against a PERSISTED bad value, so
   * removing that guard fails here.
   *
   * These touch the real ~/.honcho: state.ts resolves paths through
   * `homedir()`, and Bun reads that from the passwd entry while ignoring
   * process.env.HOME, so the directory cannot be redirected from a test. The
   * fixture id is namespaced so it can never collide with a live Claude Code
   * session_id (a UUID), and every case removes its own file in a finally.
   */
  const FIXTURE = "pr104-loader-validation-fixture";

  function withPersistedLedger(raw: unknown, assert: (loaded: DedupLedger) => void): void {
    mkdirSync(join(homedir(), ".honcho"), { recursive: true });
    const path = join(homedir(), ".honcho", `dedup-${FIXTURE}.json`);
    try {
      writeFileSync(path, JSON.stringify(raw));
      assert(loadDedupLedger(FIXTURE));
    } finally {
      clearSessionFiles(FIXTURE);
      expect(existsSync(path)).toBe(false);
    }
  }

  test("loadDedupLedger discards a persisted non-numeric stamp", () => {
    withPersistedLedger({ turn: 5, seen: { "u:x": "abc" } }, (loaded) => {
      expect(loaded.seen).toEqual({});
      expect(loaded.turn).toBe(5); // a valid turn survives; only `seen` is rejected
    });
  });

  test("loadDedupLedger discards a persisted array seen map", () => {
    withPersistedLedger({ turn: 3, seen: [1, 2, 3] }, (loaded) => {
      expect(loaded.seen).toEqual({});
    });
  });

  test("loadDedupLedger round-trips a valid numeric seen map", () => {
    withPersistedLedger({ turn: 4, seen: { "u:x": 2 } }, (loaded) => {
      expect(loaded.seen).toEqual({ "u:x": 2 });
      expect(loaded.turn).toBe(4);
    });
  });
});

describe("pruneLedger", () => {
  test("drops stamps older than the retention horizon and keeps the rest", () => {
    const l = ledger(100, { old: 100 - DEDUP_LEDGER_RETAIN_TURNS, recent: 99 });
    const pruned = pruneLedger(l);
    expect(pruned.turn).toBe(100);
    expect(pruned.seen).toEqual({ recent: 99 });
  });
});

// ---------------------------------------------------------------------------
// The payload-level guarantee: dedup shapes additionalContext, and does so
// independently of any display setting.
// ---------------------------------------------------------------------------

const injection = (showContents: string[]): InjectionConfig =>
  ({
    sessionStart: [],
    perTurn: ["userContext", "assistantContext"],
    showContents,
  }) as unknown as InjectionConfig;

const repr = (lines: string[]) => ({ representation: lines.join("\n") });

/**
 * Capture the additionalContext payload emitted on stdout.
 *
 * Only lines that actually carry `hookSpecificOutput.additionalContext` count.
 * The hook can emit more than one line per turn (a systemMessage-only line, for
 * one), and an unconditional assignment would let a later non-payload line
 * clobber the real capture with "". Non-JSON lines are ignored rather than
 * thrown on, so this stays correct if anything else ever writes to stdout.
 */
function captureAdditionalContext(fn: () => void): string {
  const original = console.log;
  let captured = "";
  console.log = (line: string) => {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // not our payload
    }
    const ctx = parsed?.hookSpecificOutput?.additionalContext;
    if (typeof ctx === "string") captured = ctx;
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return captured;
}

describe("emitPerTurn dedup applied to additionalContext", () => {
  const config = { peerName: "tester", aiPeer: "assistant" };
  const conclusions = ["Prefers concise answers", "Prefers a conversational tone", "Wants structure per-context", "Uses bun"];


  test("a repeat turn produces a SMALLER but non-empty payload", () => {
    const l = ledger(0);

    l.turn = 1;
    const first = captureAdditionalContext(() =>
      emitPerTurn(config, injection([]), { context: repr(conclusions) }, null, null, null, undefined, l),
    );

    l.turn = 2;
    const second = captureAdditionalContext(() =>
      emitPerTurn(config, injection([]), { context: repr(conclusions) }, null, null, null, undefined, l),
    );

    expect(first).toContain("Prefers concise answers");
    expect(second.length).toBeGreaterThan(0);
    expect(second.length).toBeLessThan(first.length);
    expect(second).toContain("Relevant conclusions:");
  });

  test("a fresh session (fresh ledger) gets the full payload again", () => {
    const shared = ledger(1);
    const full = captureAdditionalContext(() =>
      emitPerTurn(config, injection([]), { context: repr(conclusions) }, null, null, null, undefined, shared),
    );

    shared.turn = 2;
    captureAdditionalContext(() =>
      emitPerTurn(config, injection([]), { context: repr(conclusions) }, null, null, null, undefined, shared),
    );

    // A new session starts from a clean ledger — nothing carries over.
    const freshSession = ledger(1);
    const refetched = captureAdditionalContext(() =>
      emitPerTurn(config, injection([]), { context: repr(conclusions) }, null, null, null, undefined, freshSession),
    );
    expect(refetched).toBe(full);
  });

  test("additionalContext is byte-identical regardless of showContents (ledger POPULATED)", () => {
    // With an empty ledger this assertion passes trivially — populate it first
    // so the dedup path itself is what gets compared across display settings.
    const seed = ledger(1);
    filterRepeats(conclusions.slice(0, 2), seed, "u");

    const run = (showContents: string[]) => {
      const l: DedupLedger = { turn: 2, seen: { ...seed.seen } };
      return captureAdditionalContext(() =>
        emitPerTurn(config, injection(showContents), { context: repr(conclusions) }, repr(conclusions), null, null, undefined, l),
      );
    };

    const hidden = run([]);
    const shown = run(["userContext", "assistantContext"]);
    expect(hidden).toBe(shown);
    expect(hidden.length).toBeGreaterThan(0);
  });

  test("without a ledger, behavior is unchanged — every conclusion is injected", () => {
    const withoutLedger = captureAdditionalContext(() =>
      emitPerTurn(config, injection([]), { context: repr(conclusions) }, null, null, null),
    );
    for (const c of conclusions) expect(withoutLedger).toContain(c);
  });
});
