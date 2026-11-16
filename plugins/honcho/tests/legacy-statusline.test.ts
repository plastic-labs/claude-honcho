import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { removeLegacyStatusline } from "../src/config";

describe("removeLegacyStatusline", () => {
  let dir: string;
  let settings: string;
  let script: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "honcho-statusline-"));
    settings = join(dir, "settings.json");
    script = join(dir, "honcho-statusline.sh");
    writeFileSync(script, "#!/usr/bin/env bash\n");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const read = () => JSON.parse(readFileSync(settings, "utf-8"));

  test("removes the registration /honcho:setup wrote, and the script", () => {
    writeFileSync(settings, JSON.stringify({
      model: "opus",
      statusLine: { type: "command", command: script, refreshInterval: 1 },
    }));
    expect(removeLegacyStatusline(settings, script)).toContain("Removed the old Honcho statusLine");
    expect(read()).toEqual({ model: "opus" });
    expect(existsSync(script)).toBe(false);
    expect(existsSync(`${settings}.honcho-tmp`)).toBe(false);
  });

  test("leaves a statusLine the user set up alone", () => {
    const own = { statusLine: { type: "command", command: "~/bin/my-line.sh" } };
    writeFileSync(settings, JSON.stringify(own));
    expect(removeLegacyStatusline(settings, script)).toBeUndefined();
    expect(read()).toEqual(own);
    expect(existsSync(script)).toBe(true);
  });

  test("does nothing without a settings file or with one it can't parse", () => {
    expect(removeLegacyStatusline(settings, script)).toBeUndefined();
    writeFileSync(settings, "{ not json");
    expect(removeLegacyStatusline(settings, script)).toBeUndefined();
    expect(readFileSync(settings, "utf-8")).toBe("{ not json");
    expect(existsSync(script)).toBe(true);
  });
});
