import type { UIAdapterModule } from "../types";
import { parseProcessStdoutLine } from "../process/parse-stdout";
import { ApiAdapterConfigFields } from "../api-config-fields";
import { buildGeminiApiConfig } from "@paperclipai/adapter-gemini-api/ui";

export const geminiApiUIAdapter: UIAdapterModule = {
  type: "gemini_api",
  label: "Gemini API",
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: ApiAdapterConfigFields,
  buildAdapterConfig: buildGeminiApiConfig,
};
