export type ApiAdapterType =
  | "openai_api"
  | "anthropic_api"
  | "gemini_api"
  | "openai_compatible";

type ApiAdapterMetadata = {
  credentialKey: string;
  credentialLabel: string;
  valuePlaceholder: string;
  discoveryHint: string;
};

const API_ADAPTER_METADATA: Record<ApiAdapterType, ApiAdapterMetadata> = {
  openai_api: {
    credentialKey: "OPENAI_API_KEY",
    credentialLabel: "OpenAI API key",
    valuePlaceholder: "sk-...",
    discoveryHint: "Load the live model list from OpenAI using the configured API key.",
  },
  anthropic_api: {
    credentialKey: "ANTHROPIC_API_KEY",
    credentialLabel: "Anthropic API key",
    valuePlaceholder: "sk-ant-...",
    discoveryHint: "Load the live model list from Anthropic using the configured API key.",
  },
  gemini_api: {
    credentialKey: "GEMINI_API_KEY",
    credentialLabel: "Gemini API key",
    valuePlaceholder: "AIza...",
    discoveryHint: "Load the live model list from Gemini using the configured API key.",
  },
  openai_compatible: {
    credentialKey: "OPENAI_API_KEY",
    credentialLabel: "Bearer API key",
    valuePlaceholder: "sk-... or provider token",
    discoveryHint:
      "Load the live model list from the configured OpenAI-compatible endpoint using the current base URL and bearer token.",
  },
};

export function isApiAdapterType(value: string): value is ApiAdapterType {
  return value in API_ADAPTER_METADATA;
}

export function getApiAdapterMetadata(adapterType: string): ApiAdapterMetadata | null {
  if (!isApiAdapterType(adapterType)) return null;
  return API_ADAPTER_METADATA[adapterType];
}
