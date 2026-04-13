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

function readBaseUrl(config: Record<string, unknown>): string {
  const value = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  if (!value) return "https://api.openai.com/v1/";
  try {
    return new URL(value.endsWith("/") ? value : `${value}/`).toString();
  } catch {
    return "https://api.openai.com/v1/";
  }
}

function readOrganization(config: Record<string, unknown>): string | null {
  const value = typeof config.organizationId === "string" ? config.organizationId.trim() : "";
  return value || null;
}

function readProject(config: Record<string, unknown>): string | null {
  const value = typeof config.projectId === "string" ? config.projectId.trim() : "";
  return value || null;
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
  if (!apiKey) return [];

  const response = await fetch(new URL("models", readBaseUrl(config)).toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(readOrganization(config) ? { "OpenAI-Organization": readOrganization(config)! } : {}),
      ...(readProject(config) ? { "OpenAI-Project": readProject(config)! } : {}),
    },
  });
  if (!response.ok) return [];

  const payload = await response.json().catch(() => null) as
    | { data?: Array<{ id?: string }> }
    | null;
  const models = (payload?.data ?? []).flatMap((entry) => {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    return id ? [{ id, label: id }] : [];
  });
  return sortAndDedupe(models);
}
