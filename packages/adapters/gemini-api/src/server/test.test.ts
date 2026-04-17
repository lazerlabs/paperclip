import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "./test.js";

describe("gemini api adapter environment test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("classifies unreachable endpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com")),
    );

    const result = await testEnvironment({
      companyId: "company-test",
      adapterType: "gemini_api",
      config: {
        cwd: process.cwd(),
        model: "gemini-2.5-pro",
        env: {
          GEMINI_API_KEY: "gem-test",
        },
      },
    });

    expect(result.status).toBe("fail");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "gemini_api_unreachable",
          level: "error",
        }),
      ]),
    );
  });
});
