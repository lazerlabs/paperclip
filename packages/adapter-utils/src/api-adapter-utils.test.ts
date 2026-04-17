import { describe, expect, it } from "vitest";
import { readResolvedEnvBindings } from "./api-adapter-utils.js";

describe("readResolvedEnvBindings", () => {
  it("supports resolved runtime strings and persisted plain bindings", () => {
    expect(
      readResolvedEnvBindings({
        OPENAI_API_KEY: "sk-runtime",
        GEMINI_API_KEY: { type: "plain", value: "sk-persisted" },
        ANTHROPIC_API_KEY: { type: "secret_ref", secretId: "secret-1", version: "latest" },
      }),
    ).toEqual({
      OPENAI_API_KEY: "sk-runtime",
      GEMINI_API_KEY: "sk-persisted",
    });
  });
});
