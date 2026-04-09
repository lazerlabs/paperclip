import type { UIAdapterModule } from "../types";
import { parseProcessStdoutLine } from "../process/parse-stdout";
import { ApiAdapterConfigFields } from "../api-config-fields";
import { buildOpenAiApiConfig } from "@paperclipai/adapter-openai-api/ui";

export const openAiApiUIAdapter: UIAdapterModule = {
  type: "openai_api",
  label: "OpenAI API",
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: ApiAdapterConfigFields,
  buildAdapterConfig: buildOpenAiApiConfig,
};
