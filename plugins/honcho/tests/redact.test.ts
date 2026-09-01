import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { redactSecrets, validateRedactPattern } from "../src/redact";

interface UploadedMessage {
  content: string;
  metadata?: Record<string, unknown>;
}

let uploaded: UploadedMessage[] = [];
let hookInput = "";
let config: Record<string, any> = {};
let transcriptDir = "";

class FakeHoncho {
  workspaceId = "test-workspace";
  http = {};

  session(name: string): FakeSession {
    return new FakeSession(name);
  }
}

class FakePeer {
  constructor(public id: string) {}

  message(content: string, options?: Omit<UploadedMessage, "content">): UploadedMessage {
    return { content, ...options };
  }
}

class FakeSession {
  constructor(public id: string) {}

  async addMessages(messages: UploadedMessage[]): Promise<void> {
    uploaded.push(...messages);
  }
}

mock.module("@honcho-ai/sdk", () => ({
  Honcho: FakeHoncho,
  Peer: FakePeer,
  Session: FakeSession,
}));

mock.module("../src/config.js", () => ({
  getCachedStdin: () => hookInput,
  getContextRefreshConfig: () => ({}),
  getHonchoClientOptions: () => ({}),
  getSessionForPath: () => "test-session",
  getSessionName: () => "test-session",
  isPluginEnabled: () => true,
  loadConfig: () => config,
  readStdinText: async () => hookInput,
}));

mock.module("../src/hooks/user-prompt.js", () => ({
  isHarnessInjected: () => false,
  isTerseReply: () => false,
}));

mock.module("../src/log.js", () => ({
  logApiCall: () => {},
  logHook: () => {},
  setLogContext: () => {},
}));

mock.module("../src/visual.js", () => ({ visStopMessage: () => {} }));

const { handleSaveUserMessage } = await import("../src/hooks/save-user-message.js");
const { handleStop } = await import("../src/hooks/stop.js");
const exitSpy = spyOn(process, "exit").mockImplementation((() => undefined) as never);

function uploadedContent(): string {
  return uploaded.map((message) => message.content.replace(/^\[Part \d+\/\d+\] /, "")).join("");
}

beforeEach(() => {
  uploaded = [];
  hookInput = "";
  config = {
    aiPeer: "assistant",
    apiKey: "synthetic-api-key",
    peerName: "user",
    redactPatterns: [],
    workspace: "test-workspace",
  };
});

afterEach(() => {
  if (transcriptDir) rmSync(transcriptDir, { recursive: true, force: true });
  transcriptDir = "";
});

afterAll(() => exitSpy.mockRestore());

describe("redactSecrets defaults", () => {
  test("env-var assignments with secret-bearing keys", () => {
    expect(redactSecrets('Ran: export PGPASSWORD=SuperSecret123; psql -h 127.0.0.1 (success)'))
      .toBe('Ran: export PGPASSWORD=***; psql -h 127.0.0.1 (success)');
    expect(redactSecrets('AWS_SECRET_ACCESS_KEY=abc/def+123'))
      .toBe('AWS_SECRET_ACCESS_KEY=***');
    expect(redactSecrets('MYSQL_PWD="hunter two"'))
      .toBe('MYSQL_PWD=***');
    expect(redactSecrets('api_key=xyz'))
      .toBe('api_key=***');
    expect(redactSecrets('MODE=development PORT=5432'))
      .toBe('MODE=development PORT=5432');
  });

  test("assignment values spanning adjacent shell-word fragments", () => {
    expect(redactSecrets('PGPASSWORD=pre"secret suffix"'))
      .toBe('PGPASSWORD=***');
    expect(redactSecrets("PGPASSWORD=pre'secret suffix'"))
      .toBe('PGPASSWORD=***');
    expect(redactSecrets('PGPASSWORD=pre\\ secret psql'))
      .toBe('PGPASSWORD=*** psql');
    expect(redactSecrets('PGPASSWORD=pre"secret suffix"; psql -h 127.0.0.1'))
      .toBe('PGPASSWORD=***; psql -h 127.0.0.1');
    expect(redactSecrets('MODE=dev"elopment" PORT=5432'))
      .toBe('MODE=dev"elopment" PORT=5432');
  });

  test("--password / --token style flags", () => {
    expect(redactSecrets('mysql --password=hunter2 -u root'))
      .toBe('mysql --password=*** -u root');
    expect(redactSecrets('deploy --token abc123'))
      .toBe('deploy --token ***');
    expect(redactSecrets('curl --api-key=xyz'))
      .toBe('curl --api-key=***');
    expect(redactSecrets('parser --tokenize input.txt'))
      .toBe('parser --tokenize input.txt');
    expect(redactSecrets('mysql --password pre"secret suffix" -u root'))
      .toBe('mysql --password *** -u root');
  });

  test("secret-bearing flag names, not just an exact list", () => {
    // The rule used to match a fixed set of whole flag names, so a qualifier on
    // either side left the value in the clear: --auth matched but --auth-token
    // did not, and --access-key was absent altogether.
    expect(redactSecrets('aws --access-key AKIAsynthetic'))
      .toBe('aws --access-key ***');
    expect(redactSecrets('aws --access-key=AKIAsynthetic'))
      .toBe('aws --access-key=***');
    expect(redactSecrets('aws --access_key synthetic-value'))
      .toBe('aws --access_key ***');
    expect(redactSecrets('aws --accesskey synthetic-value'))
      .toBe('aws --accesskey ***');
    expect(redactSecrets('aws --access-key-id synthetic-value'))
      .toBe('aws --access-key-id ***');
    expect(redactSecrets('aws --aws-secret-access-key synthetic-value'))
      .toBe('aws --aws-secret-access-key ***');
    expect(redactSecrets('deploy --api_key synthetic-value'))
      .toBe('deploy --api_key ***');
    expect(redactSecrets('deploy --auth-token synthetic-value'))
      .toBe('deploy --auth-token ***');
    expect(redactSecrets('deploy --refresh-token synthetic-value'))
      .toBe('deploy --refresh-token ***');
    expect(redactSecrets('deploy --session-token synthetic-value'))
      .toBe('deploy --session-token ***');
    expect(redactSecrets('oidc --client-secret synthetic-value'))
      .toBe('oidc --client-secret ***');
    expect(redactSecrets('ssh --private-key synthetic-value'))
      .toBe('ssh --private-key ***');
    expect(redactSecrets('curl --bearer synthetic-value'))
      .toBe('curl --bearer ***');
    expect(redactSecrets('gcloud --credentials synthetic-value'))
      .toBe('gcloud --credentials ***');
    expect(redactSecrets('ssh --passphrase synthetic-value'))
      .toBe('ssh --passphrase ***');
  });

  test("a secret word inside a flag name is not enough", () => {
    // The word has to end the flag name, or every --max-tokens in a transcript
    // loses its value for nothing.
    expect(redactSecrets('llm --max-tokens 4096')).toBe('llm --max-tokens 4096');
    expect(redactSecrets('api --token-count 42')).toBe('api --token-count 42');
    expect(redactSecrets('iam --password-policy strict')).toBe('iam --password-policy strict');
    expect(redactSecrets('git --author sam')).toBe('git --author sam');
    expect(redactSecrets('svc --auth-type oidc')).toBe('svc --auth-type oidc');
    expect(redactSecrets('gcloud --credentials-file creds.json'))
      .toBe('gcloud --credentials-file creds.json');
    expect(redactSecrets('ssh --ssh-key id_ed25519')).toBe('ssh --ssh-key id_ed25519');
  });

  test("the token after a secret flag is redacted whatever it starts with", () => {
    // Two lookaheads were tried here and both leaked: (?!-) lost base64url
    // values, which begin with `-` about one time in 64, and (?!--) lost
    // `--password --hunter2`, which getopt parses as a value. Redacting a
    // following flag is cosmetic damage; either miss is permanent. Upstream
    // guards nothing here either.
    expect(redactSecrets('tool --token -AbC_opaqueBase64urlValue'))
      .toBe('tool --token ***');
    expect(redactSecrets('tool --password --hunter2')).toBe('tool --password ***');
    expect(redactSecrets('mysql --password -u root')).toBe('mysql --password *** root');
    expect(redactSecrets('mysql --password=-hunter2')).toBe('mysql --password=***');
    // The cost, stated so it is a decision and not a surprise: a valueless flag
    // eats the next word.
    expect(redactSecrets('svc --no-auth --verbose')).toBe('svc --no-auth ***');
  });

  test("a value split across a shell line continuation", () => {
    // `\\.` cannot cross a newline without the s flag, so the value on the
    // next line stayed in the clear — upstream redacts the backslash and leaks
    // the value itself.
    expect(redactSecrets('PGPASSWORD=\\\nhunter2')).toBe('PGPASSWORD=***');
    expect(redactSecrets('tool --password \\\nhunter2')).toBe('tool --password ***');
    // The quoted branch takes the same escape, so a continuation inside quotes
    // keeps the value in one word rather than ending it at the newline.
    expect(redactSecrets('PGPASSWORD="hun\\\nter2" psql')).toBe('PGPASSWORD=*** psql');
  });

  test("flags whose value IS the secret but whose name ends elsewhere", () => {
    // The tail rule cannot reach these: the name ends in string/value/user.
    // They are named in full because each one is known to carry the secret.
    expect(redactSecrets('aws secretsmanager create-secret --secret-string topsecretmaterial'))
      .toBe('aws secretsmanager create-secret --secret-string ***');
    expect(redactSecrets('aws --secret-value topsecretmaterial'))
      .toBe('aws --secret-value ***');
    expect(redactSecrets("az --connection-string 'AccountName=x;AccountKey=topsecret'"))
      .toBe('az --connection-string ***');
    expect(redactSecrets('curl --user alice:hunter2 https://example.test'))
      .toBe('curl --user *** https://example.test');
    expect(redactSecrets('curl --proxy-user alice:hunter2')).toBe('curl --proxy-user ***');
    expect(redactSecrets('tool --userpass alice:hunter2')).toBe('tool --userpass ***');
    expect(redactSecrets('tool --user-password alice:hunter2')).toBe('tool --user-password ***');
    // --user-agent still ends in `agent`, so it is untouched.
    expect(redactSecrets('curl --user-agent Mozilla/5.0')).toBe('curl --user-agent Mozilla/5.0');
  });

  test("a suffix after the secret word does not clear the assignment rule", () => {
    // Upstream matched `\\w*` on BOTH sides of the secret word. The fork dropped
    // the trailing one, which silently un-redacted every name that continues
    // past it — SECRET_KEY_BASE is a Rails production secret. A denylist of
    // "benign" tails was tried and dropped: it re-leaked PASSWORD_RESET,
    // TOKEN_PREFIX and TOKEN_SUFFIX, and no name list can tell a secret from
    // metadata about one.
    expect(redactSecrets('SECRET_KEY_BASE=0123456789abcdef'))
      .toBe('SECRET_KEY_BASE=***');
    expect(redactSecrets('DB_PASSWORD_HASH=argon2opaque'))
      .toBe('DB_PASSWORD_HASH=***');
    expect(redactSecrets('ACCESS_TOKEN_VALUE=opaquevalue'))
      .toBe('ACCESS_TOKEN_VALUE=***');
    // The three the denylist re-leaked, pinned so it cannot come back.
    expect(redactSecrets('PASSWORD_RESET=temporary-password-Z9'))
      .toBe('PASSWORD_RESET=***');
    expect(redactSecrets('TOKEN_PREFIX=first-secret-fragment'))
      .toBe('TOKEN_PREFIX=***');
    expect(redactSecrets('TOKEN_SUFFIX=second-secret-fragment'))
      .toBe('TOKEN_SUFFIX=***');
  });

  test("Authorization headers", () => {
    expect(redactSecrets('curl -H "Authorization: Bearer eyJhbGciOi"'))
      .toBe('curl -H "Authorization: Bearer ***"');
    expect(redactSecrets('Authorization: Digest synthetic-challenge'))
      .toBe('Authorization: Digest synthetic-challenge');
  });

  test("credentials embedded in URLs", () => {
    expect(redactSecrets('psql postgres://app:s3cret@db.host:5432/prod'))
      .toBe('psql postgres://app:***@db.host:5432/prod');
    expect(redactSecrets('psql postgres://app@db.host:5432/prod'))
      .toBe('psql postgres://app@db.host:5432/prod');
  });

  test("well-known token shapes", () => {
    expect(redactSecrets('hch_abcdefghijklmnop1234 in output')).toBe('*** in output');
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE in output')).toBe('*** in output');
    expect(redactSecrets('gh auth ghp_abcdefghijklmnopqrstuvwx')).toBe('gh auth ***');
    expect(redactSecrets('key sk-ant-api03-abcdefghijklmnop')).toBe('key ***');
    expect(redactSecrets('xoxb-1234567890-abcdefghij')).toBe('***');
    expect(redactSecrets(`key nvapi-${'n'.repeat(24)}`)).toBe('key ***');
    expect(redactSecrets(`key AIza${'g'.repeat(35)}`)).toBe('key ***');
    expect(redactSecrets('sk-short ghp_short xoxb-short nvapi-short AIzaShort'))
      .toBe('sk-short ghp_short xoxb-short nvapi-short AIzaShort');
  });

  test("token shapes ending in a hyphen are redacted whole", () => {
    // A terminal \b cannot follow a '-', so these used to match short or,
    // for the fixed-length AIza shape, not at all.
    expect(redactSecrets(`key AIza${'g'.repeat(34)}- done`)).toBe('key *** done');
    expect(redactSecrets(`key sk-${'a'.repeat(16)}- done`)).toBe('key *** done');
    expect(redactSecrets(`key glpat-${'a'.repeat(20)}- done`)).toBe('key *** done');
  });

  test("private key blocks", () => {
    const privateKey = [
      '-----BEGIN PRIVATE KEY-----',
      'c3ludGhldGljLWtleS1tYXRlcmlhbA==',
      '-----END PRIVATE KEY-----',
    ].join('\n');
    const publicKey = [
      '-----BEGIN PUBLIC KEY-----',
      'c3ludGhldGljLXB1YmxpYy1tYXRlcmlhbA==',
      '-----END PUBLIC KEY-----',
    ].join('\n');
    expect(redactSecrets(`key:\n${privateKey}\ndone`)).toBe('key:\n***\ndone');
    expect(redactSecrets(publicKey)).toBe(publicKey);
  });

  test("JSON and YAML secret assignments", () => {
    expect(redactSecrets('{"api_key": "synthetic-value", "region": "local"}'))
      .toBe('{"api_key": "***", "region": "local"}');
    expect(redactSecrets('{"api_key": "synthetic-\\"value"}'))
      .toBe('{"api_key": "***"}');
    expect(redactSecrets('token: synthetic-value\nmode: local'))
      .toBe('token: ***\nmode: local');
    expect(redactSecrets('{"token_count": 42, "password_policy": "strict"}'))
      .toBe('{"token_count": 42, "password_policy": "strict"}');
  });

  test("JWT shapes", () => {
    const jwt = `eyJ${'h'.repeat(12)}.${'p'.repeat(16)}.${'s'.repeat(20)}`;
    expect(redactSecrets(`jwt ${jwt} done`)).toBe('jwt *** done');
    expect(redactSecrets('eyJ-prefixed prose and eyJabc.def only-two-segments'))
      .toBe('eyJ-prefixed prose and eyJabc.def only-two-segments');
    const hyphenTail = `eyJ${'h'.repeat(5)}.${'p'.repeat(5)}.${'s'.repeat(4)}-`;
    expect(redactSecrets(`jwt ${hyphenTail} done`)).toBe('jwt *** done');
  });

  test("Telegram bot token shapes", () => {
    const telegramToken = `123456789:AA${'t'.repeat(35)}`;
    expect(redactSecrets(`bot ${telegramToken} done`)).toBe('bot *** done');
    expect(redactSecrets(`bot 12345678:AA${'t'.repeat(34)} done`))
      .toBe(`bot 12345678:AA${'t'.repeat(34)} done`);
    expect(redactSecrets(`bot 123456789:AA${'t'.repeat(34)}- done`)).toBe('bot *** done');
  });

  test("URL query credentials", () => {
    expect(redactSecrets('https://example.test/run?api_key=synthetic-value&auth=synthetic-auth&limit=1'))
      .toBe('https://example.test/run?api_key=***&auth=***&limit=1');
    expect(redactSecrets('https://example.test/run?api-key=synthetic-value&access-key=synthetic-access'))
      .toBe('https://example.test/run?api-key=***&access-key=***');
    // The assignment rule also fires inside a query string, so these lose their
    // values. Deliberate: PASSWORD_RESET=<temporary password> is a real secret
    // and no rule distinguishes it from password_reset=true by name.
    expect(redactSecrets('https://example.test/run?token_count=3&password_reset=true'))
      .toBe('https://example.test/run?token_count=***&password_reset=***');
  });

  test("does not mangle ordinary commands", () => {
    expect(redactSecrets('mkdir -p src/hooks && bun test')).toBe('mkdir -p src/hooks && bun test');
    expect(redactSecrets('find . -print -prune')).toBe('find . -print -prune');
    expect(redactSecrets('Edited config.ts: changed: localContext')).toBe('Edited config.ts: changed: localContext');
    expect(redactSecrets('PATH=/usr/bin ls')).toBe('PATH=/usr/bin ls');
  });
});

describe("redactSecrets custom patterns", () => {
  test("user patterns are additive and replace whole match", () => {
    expect(redactSecrets('conn acme-internal-abc123 ok', ['acme-internal-\\w+']))
      .toBe('conn *** ok');
  });

  test("invalid user patterns are skipped, defaults still apply", () => {
    expect(redactSecrets('PGPASSWORD=x', ['[unclosed']))
      .toBe('PGPASSWORD=***');
  });
});

describe("validateRedactPattern", () => {
  test("accepts valid regex", () => {
    expect(validateRedactPattern('foo\\d+')).toBeNull();
  });

  test("rejects invalid regex with message", () => {
    expect(validateRedactPattern('[unclosed')).toContain("Invalid regex");
  });
});

describe("message upload redaction", () => {
  test("user prompts are redacted before chunking", async () => {
    const prefix = "u".repeat(23998) + "/";
    const secret = `sk-${"x".repeat(20)}`;
    hookInput = JSON.stringify({ cwd: process.cwd(), prompt: prefix + secret, session_id: "test-session-id" });

    await handleSaveUserMessage();

    expect(uploadedContent()).toBe(prefix + "***");
  });

  test("assistant text uses configured redaction before chunking", async () => {
    const prefix = "a".repeat(23998);
    const secret = `CUSTOM_${"Z".repeat(20)}`;
    config.redactPatterns = ["CUSTOM_[A-Z]{20}"];
    transcriptDir = mkdtempSync(join(process.cwd(), ".upload-redaction-"));
    const transcriptPath = join(transcriptDir, "transcript.jsonl");
    writeFileSync(transcriptPath, [
      JSON.stringify({ type: "user", message: { content: "respond" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: prefix + secret }] } }),
    ].join("\n"));
    hookInput = JSON.stringify({ cwd: process.cwd(), session_id: "test-session-id", transcript_path: transcriptPath });

    await handleStop();

    expect(uploadedContent()).toBe(prefix + "***");
  });
});
