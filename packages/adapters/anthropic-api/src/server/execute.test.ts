import { describe, expect, it } from "vitest";
import { buildAnthropicMessagesRequest, mapAnthropicResponse } from "./execute.js";

describe("anthropic api adapter helpers", () => {
  it("builds anthropic message requests", () => {
    expect(
      buildAnthropicMessagesRequest({ model: "claude-sonnet-4-5", prompt: "hello" }),
    ).toMatchObject({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("maps anthropic usage and text blocks", () => {
    expect(
      mapAnthropicResponse({
        model: "claude-sonnet-4-5",
        content: [{ type: "text", text: "done" }],
        usage: { input_tokens: 9, output_tokens: 4, cache_read_input_tokens: 2 },
      }),
    ).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      summary: "done",
      usage: {
        inputTokens: 9,
        outputTokens: 4,
        cachedInputTokens: 2,
      },
    });
  });
});
