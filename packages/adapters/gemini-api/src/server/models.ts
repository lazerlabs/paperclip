import type { AdapterModel, AdapterModelDiscoveryContext } from "@paperclipai/adapter-utils";
import { readResolvedEnvBindings } from "@paperclipai/adapter-utils/api-adapter-utils";

function readApiKey(config: Record<string, unknown>): string | null {
  const env = readResolvedEnvBindings(config.env);
  const configValue = typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
  if (configValue) return configValue;
  const hostValue = typeof process.env.GEMINI_API_KEY === "string" ? process.env.GEMINI_API_KEY.trim() : "";
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
  if (!apiKey) return [];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) return [];

  const payload = await response.json().catch(() => null) as
    | {
        models?: Array<{
          name?: string;
          baseModelId?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }>;
      }
    | null;
  const models = (payload?.models ?? []).flatMap((entry) => {
    const methods = Array.isArray(entry.supportedGenerationMethods)
      ? entry.supportedGenerationMethods
      : [];
    if (!methods.includes("generateContent")) return [];
    const id =
      typeof entry.baseModelId === "string" && entry.baseModelId.trim().length > 0
        ? entry.baseModelId.trim()
        : typeof entry.name === "string"
          ? entry.name.replace(/^models\//, "").trim()
          : "";
    if (!id) return [];
    const label =
      typeof entry.displayName === "string" && entry.displayName.trim().length > 0
        ? entry.displayName.trim()
        : id;
    return [{ id, label }];
  });
  return sortAndDedupe(models);
}
