import type { UIAdapterModule } from "../types";
import { parseProcessStdoutLine } from "../process/parse-stdout";
import { ApiAdapterConfigFields } from "../api-config-fields";
import { buildAnthropicApiConfig } from "@paperclipai/adapter-anthropic-api/ui";

export const anthropicApiUIAdapter: UIAdapterModule = {
  type: "anthropic_api",
  label: "Anthropic API",
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: ApiAdapterConfigFields,
  buildAdapterConfig: buildAnthropicApiConfig,
};
