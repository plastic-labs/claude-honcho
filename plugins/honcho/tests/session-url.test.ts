import { describe, expect, test } from "bun:test";
import { honchoSessionUrl } from "../src/styles";

const config = { apiKey: "k", peerName: "p", workspace: "ws", aiPeer: "a" } as never;

describe("honchoSessionUrl", () => {
  test("links the session in the Honcho app", () => {
    expect(honchoSessionUrl(config, "s 1")).toBe(
      "https://app.honcho.dev/explore?workspace=ws&view=sessions&session=s%201",
    );
  });
});
