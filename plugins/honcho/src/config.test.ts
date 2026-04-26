import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { resolveConfig, warnIfProfileRoutedSave, _resetProfileWarnCacheForTests, type HonchoFileConfig } from "./config";

const ORIG_PROFILE = process.env.HONCHO_PROFILE;
const ORIG_API_KEY = process.env.HONCHO_API_KEY;

beforeEach(() => {
  delete process.env.HONCHO_PROFILE;
  delete process.env.HONCHO_API_KEY;
  _resetProfileWarnCacheForTests();
});

afterEach(() => {
  if (ORIG_PROFILE !== undefined) process.env.HONCHO_PROFILE = ORIG_PROFILE;
  if (ORIG_API_KEY !== undefined) process.env.HONCHO_API_KEY = ORIG_API_KEY;
});

const baseRaw: HonchoFileConfig = {
  apiKey: "test-key",
  peerName: "tester",
  hosts: {
    claude_code: { workspace: "hermes", aiPeer: "coder" },
    "claude_code.director": { workspace: "7stars", aiPeer: "director" },
  },
};

describe("resolveConfig — profile-aware host block lookup", () => {
  test("HONCHO_PROFILE unset → returns bare claude_code block", () => {
    const config = resolveConfig(baseRaw, "claude_code");
    expect(config).not.toBeNull();
    expect(config!.workspace).toBe("hermes");
    expect(config!.aiPeer).toBe("coder");
    expect(config!.profile).toBeUndefined();
  });

  test("HONCHO_PROFILE=director + matching block → returns profile block", () => {
    process.env.HONCHO_PROFILE = "director";
    const config = resolveConfig(baseRaw, "claude_code");
    expect(config).not.toBeNull();
    expect(config!.workspace).toBe("7stars");
    expect(config!.aiPeer).toBe("director");
    expect(config!.profile).toBe("director");
  });

  test("HONCHO_PROFILE=ghost + no matching block → bare block + stderr warn", () => {
    process.env.HONCHO_PROFILE = "ghost";
    const stderrSpy = spyOn(process.stderr, "write");
    try {
      const config = resolveConfig(baseRaw, "claude_code");
      expect(config).not.toBeNull();
      expect(config!.workspace).toBe("hermes");
      expect(config!.aiPeer).toBe("coder");
      expect(config!.profile).toBe("ghost");
      const calls = stderrSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg =>
        msg.includes("HONCHO_PROFILE=ghost") && msg.includes("missing")
      )).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("HONCHO_PROFILE with illegal chars → sanitized to dash, matches sanitized block", () => {
    process.env.HONCHO_PROFILE = "director.7stars";
    const rawWithSanitizedBlock: HonchoFileConfig = {
      ...baseRaw,
      hosts: {
        ...baseRaw.hosts,
        "claude_code.director-7stars": { workspace: "7stars", aiPeer: "director-7stars" },
      },
    };
    const config = resolveConfig(rawWithSanitizedBlock, "claude_code");
    expect(config).not.toBeNull();
    expect(config!.workspace).toBe("7stars");
    expect(config!.aiPeer).toBe("director-7stars");
    expect(config!.profile).toBe("director-7stars");
  });

  test("HONCHO_PROFILE sanitizing to empty → bare block, no warning", () => {
    process.env.HONCHO_PROFILE = "...";
    const stderrSpy = spyOn(process.stderr, "write");
    try {
      const config = resolveConfig(baseRaw, "claude_code");
      expect(config).not.toBeNull();
      expect(config!.workspace).toBe("hermes");
      expect(config!.aiPeer).toBe("coder");
      expect(config!.profile).toBeUndefined();
      const calls = stderrSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg => msg.includes("HONCHO_PROFILE"))).toBe(false);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("missing-profile warning dedupes across multiple resolveConfig calls", () => {
    process.env.HONCHO_PROFILE = "ghost";
    const stderrSpy = spyOn(process.stderr, "write");
    try {
      resolveConfig(baseRaw, "claude_code");
      resolveConfig(baseRaw, "claude_code");
      resolveConfig(baseRaw, "claude_code");
      const matching = stderrSpy.mock.calls
        .map(call => String(call[0]))
        .filter(msg => msg.includes("HONCHO_PROFILE=ghost"));
      expect(matching.length).toBe(1);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("profile suffix with hyphens not corrupted by alias chain", () => {
    process.env.HONCHO_PROFILE = "director-7stars";
    const rawAmbiguous: HonchoFileConfig = {
      ...baseRaw,
      hosts: {
        ...baseRaw.hosts,
        "claude_code.director-7stars": { workspace: "7stars-dash",  aiPeer: "director-dash"  },
        "claude_code.director_7stars": { workspace: "7stars-under", aiPeer: "director-under" },
      },
    };
    const config = resolveConfig(rawAmbiguous, "claude_code");
    expect(config).not.toBeNull();
    expect(config!.workspace).toBe("7stars-dash");
    expect(config!.aiPeer).toBe("director-dash");
  });
});

describe("warnIfProfileRoutedSave — profile-routed write guard", () => {
  test("HONCHO_PROFILE set → writes warning to stderr", () => {
    process.env.HONCHO_PROFILE = "director";
    const stderrSpy = spyOn(process.stderr, "write");
    try {
      warnIfProfileRoutedSave("claude_code");
      const calls = stderrSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg =>
        msg.includes("HONCHO_PROFILE=director") &&
        msg.includes("hand-curated")
      )).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("HONCHO_PROFILE unset → no stderr output", () => {
    delete process.env.HONCHO_PROFILE;
    const stderrSpy = spyOn(process.stderr, "write");
    try {
      warnIfProfileRoutedSave("claude_code");
      const calls = stderrSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg => msg.includes("HONCHO_PROFILE"))).toBe(false);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("HONCHO_PROFILE empty string → no stderr output", () => {
    process.env.HONCHO_PROFILE = "";
    const stderrSpy = spyOn(process.stderr, "write");
    try {
      warnIfProfileRoutedSave("claude_code");
      const calls = stderrSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg => msg.includes("HONCHO_PROFILE"))).toBe(false);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("HONCHO_PROFILE whitespace only → no stderr output (matches resolveConfig)", () => {
    process.env.HONCHO_PROFILE = "   ";
    const stderrSpy = spyOn(process.stderr, "write");
    try {
      warnIfProfileRoutedSave("claude_code");
      const calls = stderrSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg => msg.includes("HONCHO_PROFILE"))).toBe(false);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
