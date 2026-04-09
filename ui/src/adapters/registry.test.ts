import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { UIAdapterModule } from "./types";
import {
  findUIAdapter,
  getUIAdapter,
  listUIAdapters,
  registerUIAdapter,
  unregisterUIAdapter,
} from "./registry";
import { processUIAdapter } from "./process";
import { SchemaConfigFields } from "./schema-config-fields";
import { defaultCreateValues } from "../components/agent-config-defaults";

const externalUIAdapter: UIAdapterModule = {
  type: "external_test",
  label: "External Test",
  parseStdoutLine: () => [],
  ConfigFields: () => null,
  buildAdapterConfig: () => ({}),
};

describe("ui adapter registry", () => {
  it("registers built-in SDK-backed UI adapters", () => {
    expect(findUIAdapter("openai_api")).not.toBeNull();
    expect(findUIAdapter("anthropic_api")).not.toBeNull();
    expect(findUIAdapter("gemini_api")).not.toBeNull();
    expect(findUIAdapter("openai_compatible")).not.toBeNull();
  });

  beforeEach(() => {
    unregisterUIAdapter("external_test");
  });

  afterEach(() => {
    unregisterUIAdapter("external_test");
  });

  it("registers adapters for lookup and listing", () => {
    registerUIAdapter(externalUIAdapter);

    expect(findUIAdapter("external_test")).toBe(externalUIAdapter);
    expect(getUIAdapter("external_test")).toBe(externalUIAdapter);
    expect(listUIAdapters().some((adapter) => adapter.type === "external_test")).toBe(true);
  });

  it("falls back to the process parser for unknown types after unregistering", () => {
    registerUIAdapter(externalUIAdapter);

    unregisterUIAdapter("external_test");

    expect(findUIAdapter("external_test")).toBeNull();
    const fallback = getUIAdapter("external_test");
    // Unknown types return a lazy-loading wrapper (for external adapters),
    // not the process adapter directly. The type is preserved.
    expect(fallback.type).toBe("external_test");
    // But it uses the schema-based config fields for external adapter forms.
    expect(fallback.ConfigFields).toBe(SchemaConfigFields);
  });

  it("builds openai compatible config with baseUrl, headers, and env bindings", () => {
    const adapter = getUIAdapter("openai_compatible");
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType: "openai_compatible",
      model: "llama3.1",
      baseUrl: "https://gateway.example/v1",
      headersJson: "{\"HTTP-Referer\":\"https://paperclip.test\",\"X-Trace\":7}",
      envBindings: {
        OPENAI_API_KEY: { type: "secret_ref", secretId: "secret-openai", version: "latest" },
      },
    });

    expect(config).toMatchObject({
      model: "llama3.1",
      baseUrl: "https://gateway.example/v1",
      headers: {
        "HTTP-Referer": "https://paperclip.test",
        "X-Trace": 7,
      },
      env: {
        OPENAI_API_KEY: { type: "secret_ref", secretId: "secret-openai", version: "latest" },
      },
      timeoutSec: 120,
      graceSec: 15,
    });
  });

  it("builds openai api config with default model and secret-ref env bindings", () => {
    const adapter = getUIAdapter("openai_api");
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType: "openai_api",
      envBindings: {
        OPENAI_API_KEY: { type: "secret_ref", secretId: "secret-openai" },
      },
    });

    expect(config).toMatchObject({
      model: "gpt-5",
      env: {
        OPENAI_API_KEY: { type: "secret_ref", secretId: "secret-openai" },
      },
      timeoutSec: 120,
      graceSec: 15,
    });
    expect(config).not.toHaveProperty("command");
    expect(config).not.toHaveProperty("extraArgs");
  });
});
