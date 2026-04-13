import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sdk.js", () => ({
  loadOpenAiSdk: vi.fn(),
}));

import { buildOpenAiApiRequest, execute, mapOpenAiApiResponse } from "./execute.js";
import { loadOpenAiSdk } from "./sdk.js";

function createExecutionContext(
  overrides: Partial<AdapterExecutionContext> = {},
): AdapterExecutionContext {
  const config = {
    cwd: process.cwd(),
    model: "gpt-5",
    env: {
      OPENAI_API_KEY: "sk-test",
    },
  };
  return {
    runId: "run-openai-api-test",
    agent: {
      id: "agent-openai-api",
      companyId: "company-test",
      name: "OpenAI API Agent",
      adapterType: "openai_api",
      adapterConfig: config,
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: "task-1",
    },
    config,
    context: {},
    onLog: async () => {},
    ...overrides,
  };
}

describe("openai api adapter helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds requests with previous response ids when available", () => {
    expect(
      buildOpenAiApiRequest({
        model: "gpt-5",
        prompt: "hello",
        previousResponseId: "resp_123",
      }),
    ).toMatchObject({
      model: "gpt-5",
      input: "hello",
      previous_response_id: "resp_123",
    });
  });

  it("maps response usage and session continuity metadata", () => {
    expect(
      mapOpenAiApiResponse({
        id: "resp_123",
        model: "gpt-5",
        output_text: "done",
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          input_tokens_details: { cached_tokens: 3 },
        },
      }),
    ).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      summary: "done",
      sessionParams: { responseId: "resp_123", sessionId: "resp_123" },
      sessionDisplayId: "resp_123",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        cachedInputTokens: 3,
      },
    });
  });

  it("retries without the previous response id when the stored provider session is stale", async () => {
    const responsesCreate = vi.fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Previous response resp_stale not found"), { status: 400 }),
      )
      .mockResolvedValueOnce({
        id: "resp_fresh",
        output_text: "fresh result",
        usage: {
          input_tokens: 13,
          output_tokens: 5,
        },
      });

    class MockOpenAI {
      responses = {
        create: responsesCreate,
      };
    }

    vi.mocked(loadOpenAiSdk).mockResolvedValue({
      default: MockOpenAI,
    });

    const logs: Array<{ stream: string; chunk: string }> = [];
    const result = await execute(
      createExecutionContext({
        runtime: {
          sessionId: null,
          sessionParams: { responseId: "resp_stale" },
          sessionDisplayId: "resp_stale",
          taskKey: "task-1",
        },
        onLog: async (stream, chunk) => {
          logs.push({ stream, chunk });
        },
      }),
    );

    expect(responsesCreate).toHaveBeenCalledTimes(2);
    expect(responsesCreate.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-5",
      previous_response_id: "resp_stale",
    });
    expect(responsesCreate.mock.calls[1]?.[0]).toMatchObject({
      model: "gpt-5",
    });
    expect(responsesCreate.mock.calls[1]?.[0]).not.toHaveProperty("previous_response_id");
    expect(logs.some((entry) => entry.chunk.includes("no longer resumable"))).toBe(true);
    expect(result).toMatchObject({
      exitCode: 0,
      provider: "openai",
      model: "gpt-5",
      summary: "fresh result",
      sessionId: "resp_fresh",
      sessionDisplayId: "resp_fresh",
      sessionParams: {
        responseId: "resp_fresh",
        sessionId: "resp_fresh",
        cwd: process.cwd(),
      },
      usage: {
        inputTokens: 13,
        outputTokens: 5,
      },
    });
  });

  it("extracts assistant text from structured response content", async () => {
    const responsesCreate = vi.fn().mockResolvedValue({
      id: "resp_structured",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "progress update" }],
        },
      ],
      usage: {
        input_tokens: 8,
        output_tokens: 4,
      },
    });

    class MockOpenAI {
      responses = {
        create: responsesCreate,
      };
    }

    vi.mocked(loadOpenAiSdk).mockResolvedValue({
      default: MockOpenAI,
    });

    const logs: Array<{ stream: string; chunk: string }> = [];
    const result = await execute(
      createExecutionContext({
        onLog: async (stream, chunk) => {
          logs.push({ stream, chunk });
        },
      }),
    );

    expect(result).toMatchObject({
      exitCode: 0,
      summary: "progress update",
      sessionId: "resp_structured",
    });
    expect(logs.some((entry) => entry.chunk.includes("progress update"))).toBe(true);
  });
});
