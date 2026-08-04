import { test, expect, describe } from "bun:test";
import { redactSecrets, isSensitiveKeyName, REDACTED } from "./redact.js";
import { formatToolSummary } from "./hooks/post-tool-use.js";

/**
 * Upstream #81 -- tool-capture summaries were emitted to the terminal and uploaded
 * to the Honcho server with secrets intact.
 *
 * EVERY value in this file is obviously fake. Nothing here resembles a live
 * credential: the secret-shaped fixtures are padded with the literal words
 * "fake" / "notreal" so a grep for a real key never matches, and the final test
 * in this file asserts none of them survive into output.
 */

/**
 * Obviously-fake fixture values. Keep every one of these self-labelling.
 *
 * The recognizable prefixes are assembled at runtime rather than written as
 * literals: this repo runs git-secrets as a pre-commit hook, and a literal
 * `AKIA…` / `xoxb-…` / `eyJ…` string would be rejected as a leaked credential
 * even though it is nonsense. Splitting keeps the scanner quiet without
 * weakening what the tests actually exercise -- redactSecrets() sees the
 * concatenated value, exactly as it would in a real command.
 */
const FAKE = {
  pw: "fkzz0000notreal1111",
  openai: "sk" + "-fkzz0000notreal1111zzzz",
  ghp: "ghp" + "_fkzz0000notreal1111zzzzzzzz",
  ghPat: "github" + "_pat_fkzz0000notreal1111zzzzzzzzzz",
  slack: "xoxb" + "-000000000000-fkzz0000notreal",
  aws: "AKIA" + "FKZZ0000NOTREAL1",
  jwt: "eyJ" + "fkzz0000." + "eyJ" + "fkzz1111.fkzz2222notreal",
  opaque: "fkzz2222notreal3333",
};

function assertGone(out: string, secret: string) {
  expect(out).not.toContain(secret);
  // No >=6-char fragment of the fixture may survive either -- that guards the
  // truncation-boundary case where a slice could leave a partial secret.
  for (let i = 0; i + 6 <= secret.length; i++) {
    expect(out).not.toContain(secret.slice(i, i + 6));
  }
}

describe("isSensitiveKeyName", () => {
  const sensitive = [
    "PGPASSWORD", "password", "PASSWD", "passphrase", "pwd", "DB_PWD",
    "SECRET", "CLIENT_SECRET", "clientSecret", "SECRET_KEY",
    "TOKEN", "GITHUB_TOKEN", "api_key", "API-KEY", "apikey",
    "AWS_ACCESS_KEY_ID", "access-key", "PRIVATE_KEY", "privateKey",
    "AUTHORIZATION", "auth", "X-AUTH-TOKEN", "credential", "CREDENTIALS",
    "cred", "creds", "bearer", "COOKIE", "session", "SESSION_ID",
    "PAT", "gh_pat", "--password", "--token",
  ];
  for (const name of sensitive) {
    test(`sensitive: ${name}`, () => expect(isSensitiveKeyName(name)).toBe(true));
  }

  // These are the false positives that a naive substring list produces, and
  // they would mangle ordinary captured summaries.
  const benign = [
    "path", "PATH", "patch", "pattern", "pathname", "author", "AUTHORS",
    "keyword", "PRIMARY_KEY", "SORT_KEY", "CACHE_KEY", "key", "--key",
    "name", "url", "host", "port", "file", "-n", "-l", "count",
  ];
  for (const name of benign) {
    test(`benign: ${name}`, () => expect(isSensitiveKeyName(name)).toBe(false));
  }
});

describe("redactSecrets -- secret shapes", () => {
  const cases: Array<{ name: string; input: string; gone: string[]; keeps: string[] }> = [
    {
      name: "env-var assignment prefix (the #81 reproducer)",
      input: `PGPASSWORD=${FAKE.pw} psql -h db.example.com -U app`,
      gone: [FAKE.pw],
      keeps: ["PGPASSWORD=", "psql", "db.example.com"],
    },
    {
      name: "export of an api key",
      input: `export OPENAI_API_KEY=${FAKE.openai} && node run.js`,
      gone: [FAKE.openai],
      keeps: ["OPENAI_API_KEY=", "node run.js"],
    },
    {
      name: "underscore and dash key variants",
      input: `api_key=${FAKE.opaque} ACCESS-KEY=${FAKE.opaque} client_secret=${FAKE.opaque}`,
      gone: [FAKE.opaque],
      keeps: ["api_key=", "ACCESS-KEY=", "client_secret="],
    },
    {
      name: "colon field form (JSON)",
      input: `{"password": "${FAKE.pw}", "host": "db.example.com"}`,
      gone: [FAKE.pw],
      keeps: ["password", "db.example.com"],
    },
    {
      name: "colon field form (YAML)",
      input: `db:\n  token: ${FAKE.opaque}\n  port: 5432`,
      gone: [FAKE.opaque],
      keeps: ["token:", "port: 5432"],
    },
    {
      name: "docker -e secret",
      input: `docker run -e POSTGRES_PASSWORD=${FAKE.pw} -p 5432:5432 postgres`,
      gone: [FAKE.pw],
      keeps: ["docker run", "postgres", "5432:5432"],
    },
    {
      name: "openai-style sk- value with a harmless key name",
      input: `node cli.js --model gpt --creds ${FAKE.openai}`,
      gone: [FAKE.openai],
      keeps: ["node cli.js", "--model gpt"],
    },
    {
      name: "github classic PAT",
      input: `git remote set-url origin https://${FAKE.ghp}@github.com/o/r.git`,
      gone: [FAKE.ghp],
      keeps: ["git remote set-url", "github.com"],
    },
    {
      name: "github fine-grained PAT",
      input: `gh auth login --with-token <<< ${FAKE.ghPat}`,
      gone: [FAKE.ghPat],
      keeps: ["gh auth login"],
    },
    {
      name: "slack token",
      input: `curl -d token=${FAKE.slack} https://slack.com/api/auth.test`,
      gone: [FAKE.slack],
      keeps: ["curl", "slack.com"],
    },
    {
      name: "aws access key id",
      input: `aws configure set aws_access_key_id ${FAKE.aws}`,
      gone: [FAKE.aws],
      keeps: ["aws configure set"],
    },
    {
      name: "jwt",
      input: `curl -H "Authorization: Bearer ${FAKE.jwt}" https://api.example.com/v1/me`,
      gone: [FAKE.jwt],
      keeps: ["curl", "api.example.com", "Authorization"],
    },
    {
      name: "opaque bearer token in an Authorization header",
      input: `curl -H "Authorization: Bearer ${FAKE.opaque}" https://api.example.com`,
      gone: [FAKE.opaque],
      keeps: ["Authorization", "api.example.com"],
    },
    {
      name: "Bearer token outside a recognized header name",
      input: `grpcurl -H "X-Custom-Thing: Bearer ${FAKE.opaque}" api.example.com list`,
      gone: [FAKE.opaque],
      keeps: ["Bearer", "api.example.com"],
    },
    {
      name: "url with inline credentials",
      input: `psql postgres://appuser:${FAKE.pw}@db.example.com:5432/app`,
      gone: [FAKE.pw],
      keeps: ["psql", "postgres://appuser:", "@db.example.com:5432/app"],
    },
    {
      name: "pem private key block",
      input: `echo "-----BEGIN RSA PRIVATE KEY-----\nfakekeymaterialnotreal0000\n-----END RSA PRIVATE KEY-----" > k.pem`,
      gone: ["fakekeymaterialnotreal0000"],
      keeps: ["PRIVATE KEY", "k.pem"],
    },
    {
      name: "unterminated pem private key block",
      input: `-----BEGIN OPENSSH PRIVATE KEY-----\nfakekeymaterialnotreal0000`,
      gone: ["fakekeymaterialnotreal0000"],
      keeps: ["PRIVATE KEY"],
    },
    {
      // Regression, upstream PR #99 review: in a PEM bundle the key is routinely
      // followed by `-----END CERTIFICATE-----`. The first pass needs an
      // `END ... PRIVATE KEY` terminator and skips it; if the fallback's
      // lookahead only checks for a bare `-----END`, that certificate
      // terminator satisfies it and the key material survives verbatim.
      name: "private key followed by an unrelated certificate terminator",
      input: `-----BEGIN RSA PRIVATE KEY-----\nfakekeymaterialnotreal0000\n-----END CERTIFICATE-----`,
      gone: ["fakekeymaterialnotreal0000"],
      keeps: ["PRIVATE KEY"],
    },
    {
      name: "--password flag, space form",
      input: `mycli login --password ${FAKE.pw} --host db.example.com`,
      gone: [FAKE.pw],
      keeps: ["mycli login", "--host db.example.com"],
    },
    {
      name: "--token flag, equals form",
      input: `deploy --token=${FAKE.opaque} --env prod`,
      gone: [FAKE.opaque],
      keeps: ["deploy", "--env prod"],
    },
    {
      name: "--client-secret flag",
      input: `oauth --client-id abc --client-secret ${FAKE.opaque}`,
      gone: [FAKE.opaque],
      keeps: ["--client-id abc"],
    },
    {
      name: "mysql -p inline form (psql's -p is a port, mysql's is a password)",
      input: `mysql -u root -p${FAKE.pw} -h db.example.com mydb`,
      gone: [FAKE.pw],
      keeps: ["mysql -u root", "mydb"],
    },
    {
      name: "redis-cli -a",
      input: `redis-cli -a ${FAKE.pw} --scan`,
      gone: [FAKE.pw],
      keeps: ["redis-cli", "--scan"],
    },
    {
      name: "curl -u user:password",
      input: `curl -u appuser:${FAKE.pw} https://api.example.com/v1/x`,
      gone: [FAKE.pw],
      keeps: ["curl -u appuser:", "api.example.com"],
    },
    {
      name: "--header with an authorization value",
      input: `curl --header "Authorization: token ${FAKE.opaque}" https://api.example.com`,
      gone: [FAKE.opaque],
      keeps: ["curl", "api.example.com"],
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const out = redactSecrets(c.input);
      for (const g of c.gone) assertGone(out, g);
      for (const k of c.keeps) expect(out).toContain(k);
      expect(out).toContain(REDACTED);
      // Idempotency: the hook redacts the raw command AND the assembled summary.
      expect(redactSecrets(out)).toBe(out);
    });
  }
});

describe("redactSecrets -- ordinary commands pass through unchanged", () => {
  // Over-redaction that mangles every summary would make captured memory useless.
  const benign = [
    "git status",
    "git log --oneline -20",
    "npm run build",
    "npm install --save-dev typescript",
    "bun test",
    'rg -n "pattern" src',
    "rg -l TODO --glob '!node_modules/*'",
    "fd -e ts src",
    "make -j4 all",
    "docker ps --format 'table {{.Names}}'",
    "psql -h db.example.com -p 5432 -U app -c 'select 1'",
    "ssh -p 2222 deploy@host.example.com",
    "openssl x509 --key server.pem -noout -text",
    "cp -p a.txt b.txt",
    'git commit -m "fix auth: broken login redirect"',
    'git commit -m "docs(session): note the pattern for path handling"',
    "kubectl get pods -n default",
    "export NODE_ENV=production",
    "PORT=8080 node server.js",
    "PRIMARY_KEY=id CACHE_KEY=users node seed.js",
    "curl -s https://api.example.com/v1/health",
    "tar -czf out.tgz ./dist",
    "python3 -m pytest tests/ -k pattern",
  ];
  for (const cmd of benign) {
    test(`unchanged: ${cmd}`, () => {
      expect(redactSecrets(cmd)).toBe(cmd);
    });
  }
});

test("empty and whitespace input is returned as-is", () => {
  expect(redactSecrets("")).toBe("");
  expect(redactSecrets("   ")).toBe("   ");
});

test("redaction happens BEFORE truncation -- a secret at char 200 cannot leak", () => {
  // The Bash branch slices at 100 then 60. Put the secret well past both.
  const filler = "echo aaaa && echo bbbb && echo cccc && ".repeat(6); // > 200 chars
  expect(filler.length).toBeGreaterThan(200);
  const command = `${filler}PGPASSWORD=${FAKE.pw} psql -h db.example.com`;
  expect(command.indexOf(FAKE.pw)).toBeGreaterThan(200);

  // Correct order: redact, then slice.
  const safe = redactSecrets(command).slice(0, 60);
  assertGone(safe, FAKE.pw);

  // And the same through the real summary path.
  const summary = formatToolSummary("Bash", { command }, {});
  assertGone(summary, FAKE.pw);
});

describe("every Bash sub-branch redacts a secret sitting past the truncation point", () => {
  const pad = "x".repeat(150);
  const branches: Array<{ name: string; command: string; secret: string }> = [
    {
      name: "package manager",
      command: `npm run build -- --define ${pad} --token ${FAKE.opaque}`,
      secret: FAKE.opaque,
    },
    {
      name: "git commit",
      command: `git commit -m "chore: ${pad} PGPASSWORD=${FAKE.pw}"`,
      secret: FAKE.pw,
    },
    {
      name: "git push",
      command: `git push https://${FAKE.ghp}@github.com/o/r.git main # ${pad}`,
      secret: FAKE.ghp,
    },
    {
      name: "curl / http",
      command: `curl -s https://api.example.com/v1/${pad} -H "Authorization: Bearer ${FAKE.jwt}"`,
      secret: FAKE.jwt,
    },
    {
      name: "docker / deploy",
      command: `docker run ${pad} -e DB_PASSWORD=${FAKE.pw} postgres`,
      secret: FAKE.pw,
    },
    {
      name: "default Ran:",
      command: `psql -h db.example.com ${pad} --password ${FAKE.pw}`,
      secret: FAKE.pw,
    },
  ];
  for (const b of branches) {
    test(b.name, () => {
      assertGone(formatToolSummary("Bash", { command: b.command }, {}), b.secret);
      // The assertion above passes on truncation alone — every secret here sits
      // past the 100-char cut, so it would still hold if the branch stopped
      // redacting. These two pin the actual contract: the pattern is covered,
      // and redaction runs BEFORE truncation rather than being masked by it.
      const redacted = redactSecrets(b.command);
      assertGone(redacted, b.secret);
      expect(redacted).toContain(REDACTED);
    });
  }

  // Same six branches with the secret moved in front of the truncation point,
  // where truncation cannot hide it. If redaction is removed from any branch,
  // exactly these fail.
  for (const b of branches) {
    test(`${b.name} — secret before the truncation point`, () => {
      const early = b.command.replace(` ${pad}`, "").replace(`${pad} `, "").replace(pad, "");
      expect(early).toContain(b.secret);
      expect(early.indexOf(b.secret)).toBeLessThan(100);
      assertGone(formatToolSummary("Bash", { command: early }, {}), b.secret);
    });
  }
});

describe("formatToolSummary -- end-to-end capture", () => {
  test("Bash capture with a fake secret emits a redacted, still-useful summary", () => {
    const summary = formatToolSummary(
      "Bash",
      { command: `PGPASSWORD=${FAKE.pw} psql -h db.example.com -U app` },
      { stdout: "ok" },
    );
    assertGone(summary, FAKE.pw);
    expect(summary).toContain(REDACTED);
    // Still says WHAT ran -- that is the point of keeping structure.
    expect(summary).toContain("psql");
    expect(summary).toContain("success");
  });

  test("Bash capture of a benign command is untouched", () => {
    const summary = formatToolSummary("Bash", { command: "npm run build" }, {});
    expect(summary).not.toContain(REDACTED);
    expect(summary).toContain("Package run");
  });

  test("Edit capture does not echo a secret value as a changed identifier", () => {
    const summary = formatToolSummary(
      "Edit",
      {
        file_path: "/tmp/config.ts",
        old_string: 'export const API_KEY = "";',
        new_string: `export const API_KEY = "${FAKE.openai}";`,
      },
      {},
    );
    assertGone(summary, FAKE.openai);
  });

  test("Write capture of a doc heading redacts a secret in the heading", () => {
    const summary = formatToolSummary(
      "Write",
      { file_path: "/tmp/notes.md", content: `# token: ${FAKE.opaque}\n\nbody\n` },
      {},
    );
    assertGone(summary, FAKE.opaque);
    expect(summary).toContain("notes.md");
  });

  test("Write capture of ordinary code is unchanged in shape", () => {
    const summary = formatToolSummary(
      "Write",
      { file_path: "/tmp/a.ts", content: "export function hello() { return 1; }\n" },
      {},
    );
    expect(summary).toBe("Wrote a.ts (defines function hello)");
  });
});

describe("formatToolSummary -- Task and NotebookEdit branches", () => {
  // Neither branch truncates, so neither redacts its own inputs. The exported
  // wrapper's redactSecrets pass is what covers them -- pin that, so the
  // assumption cannot silently regress if the wrapper is ever removed.
  test("Task description carrying a secret is redacted", () => {
    const summary = formatToolSummary(
      "Task",
      { description: `deploy with PGPASSWORD=${FAKE.pw}`, subagent_type: "claude" },
      {},
    );
    assertGone(summary, FAKE.pw);
    expect(summary).toContain("Agent task (claude)");
  });

  test("ordinary Task description is unchanged", () => {
    expect(formatToolSummary("Task", { description: "audit the redact module", subagent_type: "Explore" }, {}))
      .toBe("Agent task (Explore): audit the redact module");
  });

  test("NotebookEdit summary is unchanged (path and mode only, no content)", () => {
    expect(
      formatToolSummary(
        "NotebookEdit",
        { notebook_path: "/tmp/nb.ipynb", edit_mode: "insert", cell_type: "code" },
        {},
      ),
    ).toBe("Notebook insert code cell in nb.ipynb");
  });

  test("a secret in a NotebookEdit path is redacted", () => {
    const summary = formatToolSummary(
      "NotebookEdit",
      { notebook_path: `/tmp/token=${FAKE.opaque}.ipynb`, edit_mode: "replace", cell_type: "code" },
      {},
    );
    assertGone(summary, FAKE.opaque);
  });
});

test("no fixture value resembling a credential survives any summary path", () => {
  const values = Object.values(FAKE);
  const commands = [
    ...values.map((v) => `PASSWORD=${v} run`),
    ...values.map((v) => `deploy --token ${v}`),
    ...values.map((v) => `curl -H "Authorization: Bearer ${v}" https://api.example.com`),
    ...values.map((v) => `psql postgres://u:${v}@db.example.com/app`),
    ...values.map((v) => `echo '{"secret": "${v}"}'`),
  ];
  for (const command of commands) {
    const summary = formatToolSummary("Bash", { command }, {});
    for (const v of values) {
      // Any fixture that appears in the command must be fully gone; fixtures not
      // in this command trivially cannot appear.
      if (command.includes(v)) assertGone(summary, v);
    }
  }
});

test("redaction of a large payload does not blow up (no catastrophic backtracking)", () => {
  // Mirrors the perf guard in summarize-edit.test.ts: the Edit branch now runs
  // redactSecrets over both sides of the diff, which can be a large payload.
  const big = `tok ${"aaaa bbbb cccc dddd eeee ".repeat(20000)} PASSWORD=${FAKE.pw}`;
  expect(big.length).toBeGreaterThan(400_000);
  const t0 = performance.now();
  const out = redactSecrets(big);
  const elapsed = performance.now() - t0;
  assertGone(out, FAKE.pw);
  expect(elapsed).toBeLessThan(1000);
});
