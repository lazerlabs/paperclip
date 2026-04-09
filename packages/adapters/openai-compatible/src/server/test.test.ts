import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "./test.js";

function mockResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe("openai compatible adapter environment test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires a valid baseUrl before probing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "openai_compatible",
      config: {
        cwd: process.cwd(),
        model: "llama3.1",
        env: {
          OPENAI_API_KEY: "sk-test",
        },
        baseUrl: "not a url",
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("fail");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "openai_compatible_base_url_invalid",
          level: "error",
        }),
      ]),
    );
  });

  it("classifies authentication failures from the compatible endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(401, JSON.stringify({ error: { message: "invalid bearer token" } })),
      ),
    );

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "openai_compatible",
      config: {
        cwd: process.cwd(),
        model: "llama3.1",
        env: {
          OPENAI_API_KEY: "sk-test",
        },
        baseUrl: "https://gateway.example/v1",
      },
    });

    expect(result.status).toBe("fail");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "openai_compatible_auth_failed",
          level: "error",
        }),
      ]),
    );
  });
});
