#!/usr/bin/env bun
/**
 * Standalone unit test for the stripPastes() heuristic in
 * src/hooks/user-prompt.ts. Run with:
 *
 *   bun run scripts/test-strip-pastes.ts
 *
 * No test framework required. Exits 0 on pass, 1 on fail.
 *
 * The repo currently has no test runner; this file is a pragmatic
 * regression check intended to be rerun manually before releases that
 * touch user-prompt.ts. Mirrors the heuristic exactly — if the source
 * changes, this file should be updated in the same PR.
 */

function stripPastes(prompt: string): { prompt: string; redacted: boolean } {
  let redacted = false;
  let out = prompt;

  out = out.replace(/```[\s\S]*?```/g, () => {
    redacted = true;
    return "[code block removed]";
  });

  out = out.replace(/(?:^[+\-].*(?:\r?\n|$)){3,}/gm, () => {
    redacted = true;
    return "[diff removed]\n";
  });

  out = out
    .split("\n")
    .map((line) => {
      if (line.length > 200 && /\//.test(line)) {
        redacted = true;
        return "[path/output removed]";
      }
      return line;
    })
    .join("\n");

  return { prompt: out, redacted };
}

interface Case {
  name: string;
  input: string;
  expectRedacted: boolean;
  mustContain?: string[];
  mustNotContain?: string[];
}

const cases: Case[] = [
  {
    name: "pure prose — must NOT redact",
    input: "I'd like to refactor the auth middleware. Please review the trade-offs.",
    expectRedacted: false,
  },
  {
    name: "fenced code block — must redact + strip code",
    input: "Review this:\n```ts\nconst x = 1;\nconst y = 2;\n```\nThanks.",
    expectRedacted: true,
    mustContain: ["[code block removed]"],
    mustNotContain: ["const x"],
  },
  {
    name: "unified diff — must redact",
    input: "Review this diff:\n+const a = 1;\n-const b = 2;\n+const c = 3;\nThanks.",
    expectRedacted: true,
    mustContain: ["[diff removed]"],
  },
  {
    name: "long path-bearing line — must redact",
    input: "Look:\n" + "x ".repeat(110) + "/Users/foo/path/to/file.ts:123:error\nFix it.",
    expectRedacted: true,
    mustContain: ["[path/output removed]"],
  },
  {
    name: "short path-bearing line — must NOT redact",
    input: "Edit /Users/foo/file.ts please",
    expectRedacted: false,
  },
  {
    name: "adversarial-review pattern (the original bug) — must redact code, preserve prose",
    input: `You are performing an adversarial code review. Review the provided git diff:

\`\`\`diff
+function buildOperatorPlan(field) {
+  if (field.provenanceStatus === 'UNKNOWN_REQUIRE_USER') {
+    return { pauseReason: 'UNKNOWN_REQUIRE_USER' };
+  }
+}
\`\`\`

Look for race conditions and security issues.`,
    expectRedacted: true,
    mustContain: ["adversarial code review", "race conditions", "[code block removed]"],
    mustNotContain: ["buildOperatorPlan", "provenanceStatus"],
  },
  {
    name: "empty prompt — must NOT redact",
    input: "",
    expectRedacted: false,
  },
  {
    name: "only a single +/- line (not a runs-of-3+ diff) — must NOT redact",
    input: "Note: + means added, - means removed.",
    expectRedacted: false,
  },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
  const out = stripPastes(c.input);
  const errs: string[] = [];
  if (out.redacted !== c.expectRedacted) {
    errs.push(`expected redacted=${c.expectRedacted}, got ${out.redacted}`);
  }
  for (const s of c.mustContain ?? []) {
    if (!out.prompt.includes(s)) errs.push(`output missing required substring: ${JSON.stringify(s)}`);
  }
  for (const s of c.mustNotContain ?? []) {
    if (out.prompt.includes(s)) errs.push(`output contains forbidden substring: ${JSON.stringify(s)}`);
  }
  if (errs.length === 0) {
    passed++;
    console.log(`  PASS  ${c.name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${c.name}`);
    for (const e of errs) console.error(`        ${e}`);
  }
}

console.log("");
console.log(`${passed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
