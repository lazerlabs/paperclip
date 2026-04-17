import type { AdapterModel, AdapterModelDiscoveryContext } from "@paperclipai/adapter-utils";
import { readResolvedEnvBindings } from "@paperclipai/adapter-utils/api-adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";

function readApiKey(config: Record<string, unknown>): string | null {
  const env = readResolvedEnvBindings(config.env);
  const configValue = typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : "";
  if (configValue) return configValue;
  const hostValue = typeof process.env.OPENAI_API_KEY === "string" ? process.env.OPENAI_API_KEY.trim() : "";
  return hostValue || null;
}

function readBaseUrl(config: Record<string, unknown>): string | null {
  const value = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  if (!value) return null;
  try {
    return new URL(value.endsWith("/") ? value : `${value}/`).toString();
  } catch {
    return null;
  }
}

function readStaticHeaders(config: Record<string, unknown>): Record<string, string> {
  const headers = parseObject(config.headers);
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.trim().length > 0) {
      next[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      next[key] = String(value);
    }
  }
  return next;
}

function sortAndDedupe(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped.sort((left, right) => left.id.localeCompare(right.id));
}

export async function listModels(ctx?: AdapterModelDiscoveryContext): Promise<AdapterModel[]> {
  const config = parseObject(ctx?.config);
  const apiKey = readApiKey(config);
  const baseUrl = readBaseUrl(config);
  if (!apiKey) {
    if (ctx?.config) {
      throw new Error("OPENAI_API_KEY is required to load models from an OpenAI-compatible endpoint.");
    }
    return [];
  }
  if (!baseUrl) {
    if (ctx?.config) {
      throw new Error("A valid Base URL is required to load models from an OpenAI-compatible endpoint.");
    }
    return [];
  }

  const endpoint = new URL("models", baseUrl).toString();
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...readStaticHeaders(config),
    },
  });
  if (!response.ok) {
    if (ctx?.config) {
      throw new Error(
        `OpenAI-compatible model discovery failed with status ${response.status}. Check the Base URL and include /v1 when your provider expects it.`,
      );
    }
    return [];
  }

  const payload = await response.json().catch(() => null) as
    | { data?: Array<{ id?: string }> }
    | null;
  const models = (payload?.data ?? []).flatMap((entry) => {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    return id ? [{ id, label: id }] : [];
  });
  return sortAndDedupe(models);
}
