import { describe, expect, test } from "bun:test";
import { honchoSessionUrl } from "../src/styles";

const config = (endpoint?: object) => ({ apiKey: "k", peerName: "p", workspace: "ws", aiPeer: "a", endpoint }) as never;

describe("honchoSessionUrl", () => {
  test("links the production app for the production API", () => {
    expect(honchoSessionUrl(config(), "s 1")).toBe(
      "https://app.honcho.dev/explore?workspace=ws&view=sessions&session=s%201",
    );
    expect(honchoSessionUrl(config({ baseUrl: "https://api.honcho.dev" }), "s")).not.toBeNull();
  });

  test.each([
    ["staging", { baseUrl: "https://api.staging.honcho.run" }],
    ["self-hosted", { baseUrl: "https://honcho.internal.example" }],
    ["local", { environment: "local" }],
  ])("is null for a %s endpoint", (_, endpoint) => {
    expect(honchoSessionUrl(config(endpoint), "s")).toBeNull();
  });
});
