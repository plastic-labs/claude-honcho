import { describe, expect, test } from "bun:test";
import { redactSecrets, validateRedactPattern } from "../src/redact";

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
  });

  test("--password / --token style flags", () => {
    expect(redactSecrets('mysql --password=hunter2 -u root'))
      .toBe('mysql --password=*** -u root');
    expect(redactSecrets('deploy --token abc123'))
      .toBe('deploy --token ***');
    expect(redactSecrets('curl --api-key=xyz'))
      .toBe('curl --api-key=***');
  });

  test("Authorization headers", () => {
    expect(redactSecrets('curl -H "Authorization: Bearer eyJhbGciOi"'))
      .toBe('curl -H "Authorization: Bearer ***"');
  });

  test("credentials embedded in URLs", () => {
    expect(redactSecrets('psql postgres://app:s3cret@db.host:5432/prod'))
      .toBe('psql postgres://app:***@db.host:5432/prod');
  });

  test("well-known token shapes", () => {
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE in output')).toBe('*** in output');
    expect(redactSecrets('gh auth ghp_abcdefghijklmnopqrstuvwx')).toBe('gh auth ***');
    expect(redactSecrets('key sk-ant-api03-abcdefghijklmnop')).toBe('key ***');
    expect(redactSecrets('xoxb-1234567890-abcdefghij')).toBe('***');
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
