import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "./test.js";

function mockResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe("anthropic api adapter environment test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("classifies permission failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(403, JSON.stringify({ error: { message: "permission denied" } })),
      ),
    );

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "anthropic_api",
      config: {
        cwd: process.cwd(),
        model: "claude-sonnet-4-5",
        env: {
          ANTHROPIC_API_KEY: "sk-ant-test",
        },
      },
    });

    expect(result.status).toBe("fail");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "anthropic_api_permission_denied",
          level: "error",
        }),
      ]),
    );
  });
});
