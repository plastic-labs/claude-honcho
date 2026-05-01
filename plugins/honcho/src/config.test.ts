import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { resolveConfig, warnIfProfileRoutedSave, _resetProfileWarnCacheForTests, getSessionName, setSessionForPath, type HonchoFileConfig, type HonchoCLAUDEConfig } from "./config";
import * as configModule from "./config";

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

const ORIG_HONCHO_SESSION = process.env.HONCHO_SESSION;

describe("getSessionName — HONCHO_SESSION env var", () => {
  beforeEach(() => {
    delete process.env.HONCHO_SESSION;
  });

  afterEach(() => {
    if (ORIG_HONCHO_SESSION !== undefined) process.env.HONCHO_SESSION = ORIG_HONCHO_SESSION;
    else delete process.env.HONCHO_SESSION;
  });

  test("HONCHO_SESSION=foo → returns 'foo' (skips loadConfig path)", () => {
    process.env.HONCHO_SESSION = "foo";
    expect(getSessionName("/tmp/anything")).toBe("foo");
  });

  test("HONCHO_SESSION=Foo.Bar! → sanitized to 'Foo-Bar' (case preserved)", () => {
    process.env.HONCHO_SESSION = "Foo.Bar!";
    expect(getSessionName("/tmp/anything")).toBe("Foo-Bar");
  });

  test("HONCHO_SESSION=--- → sanitizes to empty → falls through (no env-derived name)", () => {
    process.env.HONCHO_SESSION = "---";
    const result = getSessionName("/tmp/somedir");
    // Falls through to existing logic. We assert only that the env-var path
    // didn't return the literal "---" or empty string.
    expect(result).not.toBe("---");
    expect(result).not.toBe("");
  });

  test("HONCHO_SESSION='   ' (whitespace) → falls through", () => {
    process.env.HONCHO_SESSION = "   ";
    const result = getSessionName("/tmp/somedir");
    expect(result).not.toBe("   ");
    expect(result).not.toBe("");
  });

  test("HONCHO_SESSION unset → falls through to existing logic", () => {
    delete process.env.HONCHO_SESSION;
    const result = getSessionName("/tmp/somedir");
    // Existing logic depends on disk config; we just check the env-var path
    // didn't intercept (returned a non-empty value derived from cwd or strategy).
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("HONCHO_SESSION=foo overrides manual sessions[cwd] entry", () => {
    process.env.HONCHO_SESSION = "foo";
    const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
      apiKey: "test",
      peerName: "tester",
      workspace: "test-ws",
      aiPeer: "tester",
      sessionStrategy: "per-directory",
      sessionPeerPrefix: false,
      sessions: { "/tmp/myproj": "from-manual-map" },
    } as HonchoCLAUDEConfig);
    try {
      expect(getSessionName("/tmp/myproj")).toBe("foo");
    } finally {
      loadConfigSpy.mockRestore();
    }
  });

  test("HONCHO_SESSION unset → manual sessions[cwd] still wins under per-directory", () => {
    delete process.env.HONCHO_SESSION;
    const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
      apiKey: "test",
      peerName: "tester",
      workspace: "test-ws",
      aiPeer: "tester",
      sessionStrategy: "per-directory",
      sessionPeerPrefix: false,
      sessions: { "/tmp/myproj": "from-manual-map" },
    } as HonchoCLAUDEConfig);
    try {
      expect(getSessionName("/tmp/myproj")).toBe("from-manual-map");
    } finally {
      loadConfigSpy.mockRestore();
    }
  });
});

describe("setSessionForPath — HONCHO_SESSION write guard", () => {
  beforeEach(() => {
    delete process.env.HONCHO_SESSION;
  });

  afterEach(() => {
    if (ORIG_HONCHO_SESSION !== undefined) process.env.HONCHO_SESSION = ORIG_HONCHO_SESSION;
    else delete process.env.HONCHO_SESSION;
  });

  test("HONCHO_SESSION set → setSessionForPath emits stderr warning", () => {
    process.env.HONCHO_SESSION = "active-pin";
    const stderrSpy = spyOn(process.stderr, "write");
    const saveSpy = spyOn(configModule, "saveConfig").mockImplementation(() => {});
    const loadSpy = spyOn(configModule, "loadConfig").mockReturnValue({
      apiKey: "k", peerName: "p", workspace: "w", aiPeer: "a",
    });
    try {
      setSessionForPath("/tmp/x", "manual-name");
      const calls = stderrSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(msg =>
        msg.includes("HONCHO_SESSION=active-pin") &&
        msg.includes("setSessionForPath")
      )).toBe(true);
    } finally {
      stderrSpy.mockRestore();
      saveSpy.mockRestore();
      loadSpy.mockRestore();
    }
  });

  test("HONCHO_SESSION unset → no warning", () => {
    delete process.env.HONCHO_SESSION;
    const stderrSpy = spyOn(process.stderr, "write");
    const saveSpy = spyOn(configModule, "saveConfig").mockImplementation(() => {});
    const loadSpy = spyOn(configModule, "loadConfig").mockReturnValue({
      apiKey: "k", peerName: "p", workspace: "w", aiPeer: "a",
    });
    try {
      setSessionForPath("/tmp/x", "manual-name");
      const calls = stderrSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(msg => msg.includes("HONCHO_SESSION"))).toBe(false);
    } finally {
      stderrSpy.mockRestore();
      saveSpy.mockRestore();
      loadSpy.mockRestore();
    }
  });

  test("HONCHO_SESSION whitespace-only → no warning", () => {
    process.env.HONCHO_SESSION = "   ";
    const stderrSpy = spyOn(process.stderr, "write");
    const saveSpy = spyOn(configModule, "saveConfig").mockImplementation(() => {});
    const loadSpy = spyOn(configModule, "loadConfig").mockReturnValue({
      apiKey: "k", peerName: "p", workspace: "w", aiPeer: "a",
    });
    try {
      setSessionForPath("/tmp/x", "manual-name");
      const calls = stderrSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(msg => msg.includes("HONCHO_SESSION"))).toBe(false);
    } finally {
      stderrSpy.mockRestore();
      saveSpy.mockRestore();
      loadSpy.mockRestore();
    }
  });
});

describe("resolveConfig — HONCHO_SESSION diagnostic surface", () => {
  beforeEach(() => {
    delete process.env.HONCHO_SESSION;
  });

  afterEach(() => {
    if (ORIG_HONCHO_SESSION !== undefined) process.env.HONCHO_SESSION = ORIG_HONCHO_SESSION;
    else delete process.env.HONCHO_SESSION;
  });

  test("HONCHO_SESSION=foo → config.session='foo', sessionSource='env'", () => {
    process.env.HONCHO_SESSION = "foo";
    const config = resolveConfig(baseRaw, "claude_code");
    expect(config?.session).toBe("foo");
    expect(config?.sessionSource).toBe("env");
  });

  test("HONCHO_SESSION=Foo.Bar! → sanitized + casing preserved", () => {
    process.env.HONCHO_SESSION = "Foo.Bar!";
    const config = resolveConfig(baseRaw, "claude_code");
    expect(config?.session).toBe("Foo-Bar");
    expect(config?.sessionSource).toBe("env");
  });

  test("HONCHO_SESSION unset → session and sessionSource both undefined", () => {
    delete process.env.HONCHO_SESSION;
    const config = resolveConfig(baseRaw, "claude_code");
    expect(config?.session).toBeUndefined();
    expect(config?.sessionSource).toBeUndefined();
  });

  test("HONCHO_SESSION=--- → sanitizes to empty → both undefined", () => {
    process.env.HONCHO_SESSION = "---";
    const config = resolveConfig(baseRaw, "claude_code");
    expect(config?.session).toBeUndefined();
    expect(config?.sessionSource).toBeUndefined();
  });
});
