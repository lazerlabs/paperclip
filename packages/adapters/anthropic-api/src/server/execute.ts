import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  prepareApiAdapterRun,
  summarizeDetail,
} from "@paperclipai/adapter-utils/api-adapter-utils";
import { DEFAULT_ANTHROPIC_API_PROMPT_TEMPLATE } from "../index.js";
import { loadAnthropicSdk } from "./sdk.js";

function readApiKey(env: Record<string, string>): string | null {
  const configValue = env.ANTHROPIC_API_KEY;
  if (typeof configValue === "string" && configValue.trim().length > 0) {
    return configValue.trim();
  }
  const hostValue = process.env.ANTHROPIC_API_KEY;
  return typeof hostValue === "string" && hostValue.trim().length > 0 ? hostValue.trim() : null;
}

function textFromMessage(result: any): string {
  const contents = Array.isArray(result?.content) ? result.content : [];
  return contents
    .filter((entry: any) => entry?.type === "text" && typeof entry.text === "string")
    .map((entry: any) => entry.text)
    .join("\n")
    .trim();
}

function classifyAnthropicError(err: unknown) {
  if (err instanceof Error) {
    const record = err as Error & { status?: number };
    const status = typeof record.status === "number" ? record.status : undefined;
    const message = record.message.trim() || "Anthropic request failed";
    if (status === 401) {
      return { errorCode: "anthropic_api_auth_failed", errorMessage: message, errorMeta: { status } };
    }
    if (status === 403) {
      return { errorCode: "anthropic_api_permission_denied", errorMessage: message, errorMeta: { status } };
    }
    if (status === 429) {
      return { errorCode: "anthropic_api_quota_exceeded", errorMessage: message, errorMeta: { status } };
    }
    if (/model/i.test(message) && /not found|unknown|invalid|does not exist/i.test(message)) {
      return { errorCode: "anthropic_api_model_invalid", errorMessage: message, errorMeta: status ? { status } : undefined };
    }
    return {
      errorCode: status ? "anthropic_api_request_failed" : "anthropic_api_unreachable",
      errorMessage: message,
      errorMeta: status ? { status } : undefined,
    };
  }

  return {
    errorCode: "anthropic_api_request_failed",
    errorMessage: String(err),
  };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { onLog, onMeta, context } = ctx;
  const prepared = await prepareApiAdapterRun(ctx, {
    defaultPromptTemplate: DEFAULT_ANTHROPIC_API_PROMPT_TEMPLATE,
  });
  const { cwd, env, model, timeoutSec, prompt, promptMetrics, commandNotes } = prepared;

  const apiKey = readApiKey(env);
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "anthropic_api_key_missing",
      errorMessage: "ANTHROPIC_API_KEY is required for anthropic_api runs.",
      provider: "anthropic",
      biller: "anthropic",
      model: model || null,
    };
  }
  if (!model) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "anthropic_api_model_missing",
      errorMessage: "Model is required for anthropic_api runs.",
      provider: "anthropic",
      biller: "anthropic",
      model: null,
    };
  }

  const sdk = await loadAnthropicSdk();
  const Anthropic = sdk.default ?? sdk.Anthropic;
  const client = new Anthropic({
    apiKey,
    ...(timeoutSec > 0 ? { timeout: timeoutSec * 1000 } : {}),
    maxRetries: 0,
  });

  const inputPrompt =
    prompt.trim().length > 0
      ? prompt
      : "Continue the assigned Paperclip work and provide a concise progress update.";

  try {
    if (onMeta) {
      await onMeta({
        adapterType: "anthropic_api",
        command: "anthropic.messages.create",
        cwd,
        commandArgs: [`model=${model}`],
        commandNotes,
        prompt: inputPrompt,
        promptMetrics,
        context,
      });
    }

    const response = await client.messages.create(
      buildAnthropicMessagesRequest({ model, prompt: inputPrompt }),
    );
    const outputText = textFromMessage(response);
    if (outputText) {
      await onLog("stdout", outputText.endsWith("\n") ? outputText : `${outputText}\n`);
    }
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      ...mapAnthropicResponse(response),
      model,
    };
  } catch (err) {
    const failure = classifyAnthropicError(err);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      ...failure,
      provider: "anthropic",
      biller: "anthropic",
      model,
    };
  }
}

export function buildAnthropicMessagesRequest(input: {
  model: string;
  prompt: string;
}) {
  return {
    model: input.model,
    max_tokens: 4096,
    messages: [{ role: "user" as const, content: input.prompt }],
  };
}

export function mapAnthropicResponse(response: any) {
  const outputText = textFromMessage(response);
  return {
    provider: "anthropic" as const,
    biller: "anthropic" as const,
    billingType: "metered_api" as const,
    model:
      typeof response?.model === "string" && response.model.trim().length > 0
        ? response.model.trim()
        : null,
    usage: {
      inputTokens:
        typeof response?.usage?.input_tokens === "number" ? response.usage.input_tokens : 0,
      outputTokens:
        typeof response?.usage?.output_tokens === "number" ? response.usage.output_tokens : 0,
      ...(typeof response?.usage?.cache_read_input_tokens === "number"
        ? { cachedInputTokens: response.usage.cache_read_input_tokens }
        : {}),
    },
    resultJson:
      typeof response?.id === "string" && response.id.trim().length > 0 ? { id: response.id } : null,
    summary: summarizeDetail(outputText, 1000),
  };
}
