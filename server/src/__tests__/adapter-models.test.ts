import { beforeEach, describe, expect, it, vi } from "vitest";
import { models as codexFallbackModels } from "@paperclipai/adapter-codex-local";
import { models as cursorFallbackModels } from "@paperclipai/adapter-cursor-local";
import { models as opencodeFallbackModels } from "@paperclipai/adapter-opencode-local";
import { resetOpenCodeModelsCacheForTests } from "@paperclipai/adapter-opencode-local/server";
import { listAdapterModels } from "../adapters/index.js";
import { resetCodexModelsCacheForTests } from "../adapters/codex-models.js";
import { resetCursorModelsCacheForTests, setCursorModelsRunnerForTests } from "../adapters/cursor-models.js";

describe("adapter model listing", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.PAPERCLIP_OPENCODE_COMMAND;
    resetCodexModelsCacheForTests();
    resetCursorModelsCacheForTests();
    setCursorModelsRunnerForTests(null);
    resetOpenCodeModelsCacheForTests();
    vi.restoreAllMocks();
  });

  it("returns an empty list for unknown adapters", async () => {
    const models = await listAdapterModels("unknown_adapter");
    expect(models).toEqual([]);
  });

  it("returns codex fallback models when no OpenAI key is available", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const models = await listAdapterModels("codex_local");

    expect(models).toEqual(codexFallbackModels);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads codex models dynamically and merges fallback options", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-5-pro" },
          { id: "gpt-5" },
        ],
      }),
    } as Response);

    const first = await listAdapterModels("codex_local");
    const second = await listAdapterModels("codex_local");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.some((model) => model.id === "gpt-5-pro")).toBe(true);
    expect(first.some((model) => model.id === "codex-mini-latest")).toBe(true);
  });

  it("falls back to static codex models when OpenAI model discovery fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const models = await listAdapterModels("codex_local");
    expect(models).toEqual(codexFallbackModels);
  });

  it("loads OpenAI API models from the draft adapter config", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-5.4" },
          { id: "gpt-5.4-mini" },
        ],
      }),
    } as Response);

    const models = await listAdapterModels("openai_api", {
      companyId: "company-1",
      adapterType: "openai_api",
      config: {
        env: {
          OPENAI_API_KEY: "sk-openai",
        },
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-openai",
        }),
      }),
    );
    expect(models.map((model) => model.id)).toContain("gpt-5.4");
  });

  it("loads Anthropic API models from the draft adapter config", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "claude-opus-4-6", display_name: "Claude Opus 4.6" },
        ],
      }),
    } as Response);

    const models = await listAdapterModels("anthropic_api", {
      companyId: "company-1",
      adapterType: "anthropic_api",
      config: {
        env: {
          ANTHROPIC_API_KEY: "sk-anthropic",
        },
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "sk-anthropic",
        }),
      }),
    );
    expect(models).toEqual([{ id: "claude-opus-4-6", label: "Claude Opus 4.6" }]);
  });

  it("loads Gemini API models from the draft adapter config", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            name: "models/gemini-3.0-pro",
            baseModelId: "gemini-3.0-pro",
            displayName: "Gemini 3.0 Pro",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/text-embedding-004",
            baseModelId: "text-embedding-004",
            displayName: "Text Embedding 004",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    } as Response);

    const models = await listAdapterModels("gemini_api", {
      companyId: "company-1",
      adapterType: "gemini_api",
      config: {
        env: {
          GEMINI_API_KEY: "sk-gemini",
        },
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?key=sk-gemini",
    );
    expect(models).toEqual([{ id: "gemini-3.0-pro", label: "Gemini 3.0 Pro" }]);
  });

  it("loads OpenAI-compatible models from the configured baseUrl", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "local-gpt-oss" },
        ],
      }),
    } as Response);

    const models = await listAdapterModels("openai_compatible", {
      companyId: "company-1",
      adapterType: "openai_compatible",
      config: {
        baseUrl: "http://localhost:1234/v1",
        headers: {
          "X-Test": "yes",
        },
        env: {
          OPENAI_API_KEY: "sk-compatible",
        },
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:1234/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-compatible",
          "X-Test": "yes",
        }),
      }),
    );
    expect(models).toEqual([{ id: "local-gpt-oss", label: "local-gpt-oss" }]);
  });


  it("returns cursor fallback models when CLI discovery is unavailable", async () => {
    setCursorModelsRunnerForTests(() => ({
      status: null,
      stdout: "",
      stderr: "",
      hasError: true,
    }));

    const models = await listAdapterModels("cursor");
    expect(models).toEqual(cursorFallbackModels);
  });

  it("returns opencode fallback models including gpt-5.4", async () => {
    process.env.PAPERCLIP_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";

    const models = await listAdapterModels("opencode_local");

    expect(models).toEqual(opencodeFallbackModels);
  });

  it("loads cursor models dynamically and caches them", async () => {
    const runner = vi.fn(() => ({
      status: 0,
      stdout: "Available models: auto, composer-1.5, gpt-5.3-codex-high, sonnet-4.6",
      stderr: "",
      hasError: false,
    }));
    setCursorModelsRunnerForTests(runner);

    const first = await listAdapterModels("cursor");
    const second = await listAdapterModels("cursor");

    expect(runner).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.some((model) => model.id === "auto")).toBe(true);
    expect(first.some((model) => model.id === "gpt-5.3-codex-high")).toBe(true);
    expect(first.some((model) => model.id === "composer-1")).toBe(true);
  });

});
