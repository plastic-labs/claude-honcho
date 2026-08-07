import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  POLICY_ENV_VAR,
  capTurn,
  loadPolicy,
  resetPolicyCache,
  shouldDrop,
} from "../src/policy";
import { chunkForIngestion } from "../src/cache";

const saved = process.env[POLICY_ENV_VAR];
let dir = "";

function writePolicy(obj: object): string {
  const path = join(dir, "memory-policy.json");
  writeFileSync(path, JSON.stringify(obj));
  process.env[POLICY_ENV_VAR] = path;
  resetPolicyCache();
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "honcho-policy-"));
  resetPolicyCache();
});

afterEach(() => {
  if (saved === undefined) delete process.env[POLICY_ENV_VAR];
  else process.env[POLICY_ENV_VAR] = saved;
  resetPolicyCache();
  rmSync(dir, { recursive: true, force: true });
});

describe("loadPolicy", () => {
  test("no policy configured leaves ingestion unfiltered", () => {
    process.env[POLICY_ENV_VAR] = join(dir, "absent.json");
    resetPolicyCache();
    const policy = loadPolicy();
    expect(policy.dropPatterns).toHaveLength(0);
    expect(shouldDrop("<recommended_plugins>", policy)).toBe(false);
    expect(capTurn("x".repeat(9000), policy)).toHaveLength(9000);
  });

  test("malformed policy falls back to unfiltered rather than throwing", () => {
    const path = join(dir, "memory-policy.json");
    writeFileSync(path, "{ not json");
    process.env[POLICY_ENV_VAR] = path;
    resetPolicyCache();
    expect(loadPolicy().dropPatterns).toHaveLength(0);
  });

  test("an unparseable rule is skipped without discarding the rest", () => {
    writePolicy({
      ingestion: { drop_patterns: [{ pattern: "([unclosed" }, { pattern: "<system-reminder>" }] },
    });
    const policy = loadPolicy();
    expect(policy.dropPatterns).toHaveLength(1);
    expect(shouldDrop("<system-reminder>x</system-reminder>", policy)).toBe(true);
  });

  test("drop patterns honour declared flags", () => {
    writePolicy({
      ingestion: { drop_patterns: [{ pattern: "^#\\s*CLAUDE\\.md instructions for", flags: "m" }] },
    });
    const policy = loadPolicy();
    expect(shouldDrop("intro\n# CLAUDE.md instructions for /repo", policy)).toBe(true);
    expect(shouldDrop("an ordinary decision", policy)).toBe(false);
  });
});

describe("capTurn", () => {
  test("caps over-long turns and appends the declared marker", () => {
    writePolicy({ ingestion: { max_turn_chars: 100, truncation_marker: "…[cut]" } });
    const policy = loadPolicy();
    expect(capTurn("x".repeat(500), policy)).toBe("x".repeat(100) + "…[cut]");
    expect(capTurn("short", policy)).toBe("short");
    expect(capTurn("y".repeat(100), policy)).toBe("y".repeat(100));
  });
});

describe("chunkForIngestion", () => {
  test("returns no chunks for a dropped turn, so nothing is uploaded", () => {
    writePolicy({ ingestion: { drop_patterns: [{ pattern: "<recommended_plugins>" }] } });
    expect(chunkForIngestion("<recommended_plugins> Airtable, Asana")).toEqual([]);
  });

  test("caps before chunking, so one long turn cannot become many messages", () => {
    writePolicy({ ingestion: { max_turn_chars: 100, truncation_marker: "" } });
    const chunks = chunkForIngestion("z".repeat(80_000));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(100);
  });

  test("behaves exactly like chunkContent when no policy is configured", () => {
    process.env[POLICY_ENV_VAR] = join(dir, "absent.json");
    resetPolicyCache();
    expect(chunkForIngestion("a normal message")).toEqual(["a normal message"]);
    expect(chunkForIngestion("q".repeat(30_000)).length).toBeGreaterThan(1);
  });
});
