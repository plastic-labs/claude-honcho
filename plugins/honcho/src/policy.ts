import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Optional ingestion policy. A deployment can declare which turns are worth
// storing durably and how large a single turn may be, so the rules live in one
// reviewable file instead of being hardcoded per client.
//
// Resolution order:
//   1. $HONCHO_MEMORY_POLICY (explicit path)
//   2. ~/.honcho/memory-policy.json
//   3. none — ingestion is unfiltered, matching the historical default.
//
// Patterns are compiled with `new RegExp(pattern, flags)`, so they must avoid
// inline flag syntax such as `(?i)` that JavaScript does not accept. Declaring
// flags in a sibling field also lets the same file be shared with non-JS
// consumers.

export interface DropRule {
  id?: string;
  pattern: string;
  flags?: string;
  reason?: string;
}

export interface IngestionPolicy {
  maxTurnChars: number;
  truncationMarker: string;
  dropPatterns: RegExp[];
}

export const POLICY_ENV_VAR = "HONCHO_MEMORY_POLICY";
export const DEFAULT_POLICY_FILENAME = "memory-policy.json";

const UNFILTERED: IngestionPolicy = {
  maxTurnChars: Number.POSITIVE_INFINITY,
  truncationMarker: "",
  dropPatterns: [],
};

function candidatePaths(): string[] {
  const explicit = process.env[POLICY_ENV_VAR];
  if (explicit) return [explicit];
  return [join(homedir(), ".honcho", DEFAULT_POLICY_FILENAME)];
}

function compile(rules: unknown): RegExp[] {
  if (!Array.isArray(rules)) return [];
  const compiled: RegExp[] = [];
  for (const rule of rules as DropRule[]) {
    if (!rule || typeof rule.pattern !== "string") continue;
    try {
      compiled.push(new RegExp(rule.pattern, rule.flags ?? ""));
    } catch {
      // An unparseable rule is skipped rather than failing ingestion outright:
      // a bad policy must not cost the user their session memory.
    }
  }
  return compiled;
}

function parse(raw: string): IngestionPolicy {
  const parsed = JSON.parse(raw) as { ingestion?: Record<string, unknown> };
  const ingestion = parsed.ingestion;
  if (!ingestion || typeof ingestion !== "object") return UNFILTERED;

  const maxTurnChars =
    typeof ingestion.max_turn_chars === "number" && ingestion.max_turn_chars > 0
      ? ingestion.max_turn_chars
      : Number.POSITIVE_INFINITY;

  return {
    maxTurnChars,
    truncationMarker:
      typeof ingestion.truncation_marker === "string" ? ingestion.truncation_marker : "",
    dropPatterns: compile(ingestion.drop_patterns),
  };
}

let cached: IngestionPolicy | null = null;

export function loadPolicy(): IngestionPolicy {
  if (cached) return cached;
  for (const path of candidatePaths()) {
    try {
      cached = parse(readFileSync(path, "utf8"));
      return cached;
    } catch {
      // Missing or malformed file — fall through to the unfiltered default.
    }
  }
  cached = UNFILTERED;
  return cached;
}

// Test seam: hooks are short-lived processes, so the cache is otherwise
// per-invocation and never goes stale in normal use.
export function resetPolicyCache(): void {
  cached = null;
}

export function shouldDrop(text: string, policy: IngestionPolicy): boolean {
  return policy.dropPatterns.some((pattern) => pattern.test(text));
}

export function capTurn(text: string, policy: IngestionPolicy): string {
  if (text.length <= policy.maxTurnChars) return text;
  return text.slice(0, policy.maxTurnChars) + policy.truncationMarker;
}
