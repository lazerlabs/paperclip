import { describe, expect, it } from "vitest";
import { buildOpenAiCompatibleRequest, mapOpenAiCompatibleResponse } from "./execute.js";

describe("openai compatible adapter helpers", () => {
  it("builds chat completion requests", () => {
    expect(
      buildOpenAiCompatibleRequest({ model: "llama3.1", prompt: "hello" }),
    ).toMatchObject({
      model: "llama3.1",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    });
  });

  it("maps chat completion responses without session state", () => {
    expect(
      mapOpenAiCompatibleResponse({
        model: "llama3.1",
        choices: [{ message: { content: "done" } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 6,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      }),
    ).toMatchObject({
      provider: "openai_compatible",
      model: "llama3.1",
      summary: "done",
      usage: {
        inputTokens: 12,
        outputTokens: 6,
        cachedInputTokens: 2,
      },
    });
  });
});
