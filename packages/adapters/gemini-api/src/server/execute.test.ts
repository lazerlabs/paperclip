import { describe, expect, it } from "vitest";
import { buildGeminiRequest, mapGeminiResponse } from "./execute.js";

describe("gemini api adapter helpers", () => {
  it("builds gemini requests", () => {
    expect(buildGeminiRequest({ model: "gemini-2.5-pro", prompt: "hello" })).toEqual({
      model: "gemini-2.5-pro",
      contents: "hello",
    });
  });

  it("maps gemini usage and response text", () => {
    expect(
      mapGeminiResponse({
        modelVersion: "gemini-2.5-pro",
        text: "done",
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 3,
          cachedContentTokenCount: 1,
        },
      }),
    ).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-pro",
      summary: "done",
      usage: {
        inputTokens: 5,
        outputTokens: 3,
        cachedInputTokens: 1,
      },
    });
  });
});
