import { test, expect, describe } from "bun:test";
import { shouldObservePrompt } from "./user-prompt.js";

describe("shouldObservePrompt", () => {
  test("skips bare acknowledgements (EN/IT/ES)", () => {
    for (const ack of ["ok", "OK", "okay", "yes", "no", "sure", "thanks", "y", "n",
                        "yep", "nope", "proceed", "done", "next",
                        "sì", "si", "vai", "dai", "va bene", "certo", "ho capito"]) {
      expect(shouldObservePrompt(ack)).toBe(false);
    }
  });

  test("skips numeric menu picks and trailing punctuation", () => {
    for (const p of ["1", "2", "42", "ok.", "yes!", "sì,", "1 ", " ok "]) {
      expect(shouldObservePrompt(p)).toBe(false);
    }
  });

  test("skips slash commands and empties", () => {
    expect(shouldObservePrompt("/graphify")).toBe(false);
    expect(shouldObservePrompt("/loop check the deploy")).toBe(false);
    expect(shouldObservePrompt("")).toBe(false);
    expect(shouldObservePrompt("   ")).toBe(false);
  });

  test("observes substantive prompts", () => {
    for (const p of ["fix the app", "deploy to vercel not netlify",
                     "add a 1 euro plan", "wire up Stripe checkout",
                     "why does the webhook 500?"]) {
      expect(shouldObservePrompt(p)).toBe(true);
    }
  });
});
