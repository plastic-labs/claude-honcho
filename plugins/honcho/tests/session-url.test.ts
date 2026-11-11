import { describe, expect, test } from "bun:test";
import { honchoSessionUrl } from "../src/styles";

const config = (baseUrl: string) => ({ apiKey: "k", peerName: "p", workspace: "ws", aiPeer: "a", baseUrl }) as never;

describe("honchoSessionUrl", () => {
  test("links the session in the Honcho app on Honcho cloud", () => {
    expect(honchoSessionUrl(config("https://api.honcho.dev"), "s 1")).toBe(
      "https://app.honcho.dev/explore?workspace=ws&view=sessions&session=s%201",
    );
  });

  test.each([
    ["staging", "https://api.staging.honcho.run"],
    ["self-hosted", "https://honcho.internal.example"],
    ["local", "http://localhost:8000"],
  ])("is null for a %s endpoint", (_, baseUrl) => {
    expect(honchoSessionUrl(config(baseUrl), "s")).toBeNull();
  });
});
