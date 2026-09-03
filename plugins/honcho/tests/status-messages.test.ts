import { describe, expect, test } from "bun:test";
import { areStatusMessagesEnabled, type HonchoCLAUDEConfig } from "../src/config";

const config = (statusMessages?: unknown): HonchoCLAUDEConfig => ({
  peerName: "user",
  apiKey: "key",
  workspace: "default",
  aiPeer: "claude-code",
  ...(statusMessages === undefined ? {} : { statusMessages }),
} as HonchoCLAUDEConfig);

describe("areStatusMessagesEnabled", () => {
  test("unset keeps the status lines on", () => {
    expect(areStatusMessagesEnabled(config())).toBe(true);
  });

  test('"off" mutes them', () => {
    expect(areStatusMessagesEnabled(config("off"))).toBe(false);
  });

  test('"on" keeps them', () => {
    expect(areStatusMessagesEnabled(config("on"))).toBe(true);
  });

  test("no config at all keeps them on", () => {
    expect(areStatusMessagesEnabled(null)).toBe(true);
  });

  test("a hand-edited value that isn't exactly \"off\" keeps them on", () => {
    // Muting is opt-in: a typo must not silently silence the plugin.
    expect(areStatusMessagesEnabled(config("false"))).toBe(true);
    expect(areStatusMessagesEnabled(config("OFF"))).toBe(true);
    expect(areStatusMessagesEnabled(config(true))).toBe(true);
  });
});
