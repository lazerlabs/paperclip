import type { AdapterModel, AdapterModelDiscoveryContext } from "@paperclipai/adapter-utils";
import { readResolvedEnvBindings } from "@paperclipai/adapter-utils/api-adapter-utils";

function readApiKey(config: Record<string, unknown>): string | null {
  const env = readResolvedEnvBindings(config.env);
  const configValue = typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
  if (configValue) return configValue;
  const hostValue = typeof process.env.ANTHROPIC_API_KEY === "string" ? process.env.ANTHROPIC_API_KEY.trim() : "";
  return hostValue || null;
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
  if (!apiKey) {
    if (ctx?.config) {
      throw new Error("ANTHROPIC_API_KEY is required to load Anthropic models.");
    }
    return [];
  }

  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!response.ok) {
    if (ctx?.config) {
      throw new Error(`Anthropic model discovery failed with status ${response.status}.`);
    }
    return [];
  }

  const payload = await response.json().catch(() => null) as
    | { data?: Array<{ id?: string; display_name?: string; displayName?: string }> }
    | null;
  const models = (payload?.data ?? []).flatMap((entry) => {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    if (!id) return [];
    const label =
      typeof entry.display_name === "string" && entry.display_name.trim().length > 0
        ? entry.display_name.trim()
        : typeof entry.displayName === "string" && entry.displayName.trim().length > 0
          ? entry.displayName.trim()
          : id;
    return [{ id, label }];
  });
  return sortAndDedupe(models);
}
