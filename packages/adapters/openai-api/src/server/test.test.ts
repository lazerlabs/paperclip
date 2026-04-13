import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "./test.js";

function mockResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe("openai api adapter environment test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports missing key and model before probing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "openai_api",
      config: {
        cwd: process.cwd(),
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("fail");
    expect(result.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining(["openai_api_key_missing", "openai_api_model_missing"]),
    );
  });

  it("classifies authentication failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(401, JSON.stringify({ error: { message: "invalid api key" } })),
    );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "openai_api",
      config: {
        cwd: process.cwd(),
        model: "gpt-5",
        baseUrl: "https://proxy.example/v1",
        organizationId: "org_test",
        projectId: "proj_test",
        env: {
          OPENAI_API_KEY: { type: "plain", value: "sk-test" },
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://proxy.example/v1/responses",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "OpenAI-Organization": "org_test",
          "OpenAI-Project": "proj_test",
        }),
      }),
    );
    expect(result.status).toBe("fail");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "openai_api_auth_failed",
          level: "error",
        }),
      ]),
    );
  });

  it("classifies quota responses as warnings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(429, JSON.stringify({ error: { message: "quota exceeded" } })),
      ),
    );

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "openai_api",
      config: {
        cwd: process.cwd(),
        model: "gpt-5",
        env: {
          OPENAI_API_KEY: "sk-test",
        },
      },
    });

    expect(result.status).toBe("warn");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "openai_api_quota_exceeded",
          level: "warn",
        }),
      ]),
    );
  });

  it("classifies invalid model responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(404, JSON.stringify({ error: { message: "model not found" } })),
      ),
    );

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "openai_api",
      config: {
        cwd: process.cwd(),
        model: "gpt-not-real",
        env: {
          OPENAI_API_KEY: "sk-test",
        },
      },
    });

    expect(result.status).toBe("fail");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "openai_api_model_invalid",
          level: "error",
        }),
      ]),
    );
  });
});
