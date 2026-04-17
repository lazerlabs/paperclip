import type { UIAdapterModule } from "../types";
import { parseProcessStdoutLine } from "../process/parse-stdout";
import { ApiAdapterConfigFields } from "../api-config-fields";
import { buildOpenAiCompatibleConfig } from "@paperclipai/adapter-openai-compatible/ui";

export const openAiCompatibleUIAdapter: UIAdapterModule = {
  type: "openai_compatible",
  label: "OpenAI Compatible",
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: ApiAdapterConfigFields,
  buildAdapterConfig: buildOpenAiCompatibleConfig,
};
