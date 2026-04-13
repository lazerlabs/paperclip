import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_OPENAI_API_MODEL } from "../index.js";

function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

function parseEnvBindings(bindings: unknown): Record<string, unknown> {
  if (typeof bindings !== "object" || bindings === null || Array.isArray(bindings)) return {};
  const env: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(bindings)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof raw === "string") {
      env[key] = { type: "plain", value: raw };
      continue;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    if (rec.type === "plain" && typeof rec.value === "string") env[key] = { type: "plain", value: rec.value };
    if (rec.type === "secret_ref" && typeof rec.secretId === "string") {
      env[key] = { type: "secret_ref", secretId: rec.secretId, ...(rec.version ? { version: rec.version } : {}) };
    }
  }
  return env;
}

export function buildOpenAiApiConfig(v: CreateConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    model: v.model || DEFAULT_OPENAI_API_MODEL,
    timeoutSec: 120,
    graceSec: 15,
  };
  if (v.cwd) config.cwd = v.cwd;
  if (v.instructionsFilePath) config.instructionsFilePath = v.instructionsFilePath;
  if (v.promptTemplate) config.promptTemplate = v.promptTemplate;
  if (v.baseUrl?.trim()) config.baseUrl = v.baseUrl.trim();
  if (v.organizationId?.trim()) config.organizationId = v.organizationId.trim();
  if (v.projectId?.trim()) config.projectId = v.projectId.trim();
  const env = parseEnvBindings(v.envBindings);
  for (const [key, value] of Object.entries(parseEnvVars(v.envVars))) {
    if (!(key in env)) env[key] = { type: "plain", value };
  }
  if (Object.keys(env).length > 0) config.env = env;
  return config;
}
