/**
 * Guards hooks.json against millisecond values in the `timeout` field.
 *
 * Claude Code's hook `timeout` is in SECONDS ("Seconds before canceling.
 * Defaults: 600 for `command` ... UserPromptSubmit lowers the default to 30").
 * The plugin's manifest was originally written with millisecond values, so a
 * "10 second" intent was spelled `10000` — which Claude Code reads as 10,000
 * seconds, i.e. ~2.8 hours. The values are only ever an upper bound, so nothing
 * fails loudly; a hook that hangs simply keeps its slot for hours instead of
 * being cancelled.
 *
 * These tests are deterministic (pure JSON parsing, no network, no SDK) and
 * exist so the next hook added to the manifest can't silently reintroduce the
 * unit mix-up.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Documented ceiling for a `command` hook's default timeout, in seconds.
 *  Nothing in this plugin legitimately needs longer, and any value above it is
 *  far more likely to be milliseconds than a deliberate multi-hour budget. */
const MAX_REASONABLE_TIMEOUT_SECONDS = 600;

interface HookEntry {
  type?: string;
  command?: string;
  timeout?: number;
  async?: boolean;
}

interface Matcher {
  matcher?: string;
  hooks?: HookEntry[];
}

interface Manifest {
  description?: string;
  hooks: Record<string, Matcher[]>;
}

const manifestPath = join(import.meta.dir, "..", "hooks", "hooks.json");
const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

/** Flatten the manifest to (event, command, entry) triples for table-driven assertions. */
function allHooks(): Array<{ event: string; label: string; entry: HookEntry }> {
  const out: Array<{ event: string; label: string; entry: HookEntry }> = [];
  for (const [event, matchers] of Object.entries(manifest.hooks ?? {})) {
    for (const matcher of matchers ?? []) {
      for (const entry of matcher.hooks ?? []) {
        // Label by script basename so a failure message names the hook, not an index.
        const label = (entry.command ?? "<no command>").split("/").pop()?.replace(/"$/, "") ?? "<unknown>";
        out.push({ event, label, entry });
      }
    }
  }
  return out;
}

describe("hooks.json manifest", () => {
  test("is non-empty (guards against a silently broken parse)", () => {
    expect(allHooks().length).toBeGreaterThan(0);
  });

  test.each(allHooks().map((h) => [`${h.event} · ${h.label}`, h.entry] as const))(
    "%s declares its timeout in seconds, not milliseconds",
    (_name, entry) => {
      if (entry.timeout === undefined) return; // optional — Claude Code applies its default
      expect(Number.isInteger(entry.timeout)).toBe(true);
      expect(entry.timeout).toBeGreaterThan(0);
      expect(entry.timeout).toBeLessThanOrEqual(MAX_REASONABLE_TIMEOUT_SECONDS);
    },
  );

  test("no hook would outlive a single working day", () => {
    // Restates the bound as one aggregate assertion whose failure message lists
    // every offender at once, rather than one failing case per hook.
    const offenders = allHooks()
      .filter((h) => (h.entry.timeout ?? 0) > MAX_REASONABLE_TIMEOUT_SECONDS)
      .map((h) => `${h.event}/${h.label}=${h.entry.timeout}s (${((h.entry.timeout ?? 0) / 3600).toFixed(1)}h)`);
    expect(offenders).toEqual([]);
  });

  test("every hook entry is structurally complete", () => {
    for (const { event, label, entry } of allHooks()) {
      expect(entry.type, `${event}/${label} missing type`).toBe("command");
      expect(entry.command, `${event}/${label} missing command`).toBeTruthy();
    }
  });
});
