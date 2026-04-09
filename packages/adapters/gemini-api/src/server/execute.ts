import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  prepareApiAdapterRun,
  summarizeDetail,
} from "@paperclipai/adapter-utils/api-adapter-utils";
import { DEFAULT_GEMINI_API_PROMPT_TEMPLATE } from "../index.js";
import { loadGeminiSdk } from "./sdk.js";

function readApiKey(env: Record<string, string>): string | null {
  const configValue = env.GEMINI_API_KEY;
  if (typeof configValue === "string" && configValue.trim().length > 0) {
    return configValue.trim();
  }
  const hostValue = process.env.GEMINI_API_KEY;
  return typeof hostValue === "string" && hostValue.trim().length > 0 ? hostValue.trim() : null;
}

async function readGeminiText(result: any): Promise<string> {
  if (typeof result?.text === "function") {
    const value = await result.text();
    return typeof value === "string" ? value.trim() : "";
  }
  if (typeof result?.text === "string" && result.text.trim().length > 0) {
    return result.text.trim();
  }
  if (typeof result?.response?.text === "function") {
    const value = await result.response.text();
    return typeof value === "string" ? value.trim() : "";
  }
  if (typeof result?.response?.text === "string" && result.response.text.trim().length > 0) {
    return result.response.text.trim();
  }
  return "";
}

function classifyGeminiError(err: unknown) {
  if (err instanceof Error) {
    const record = err as Error & { status?: number };
    const status = typeof record.status === "number" ? record.status : undefined;
    const message = record.message.trim() || "Gemini request failed";
    if (status === 401) {
      return { errorCode: "gemini_api_auth_failed", errorMessage: message, errorMeta: { status } };
    }
    if (status === 403) {
      return { errorCode: "gemini_api_permission_denied", errorMessage: message, errorMeta: { status } };
    }
    if (status === 429) {
      return { errorCode: "gemini_api_quota_exceeded", errorMessage: message, errorMeta: { status } };
    }
    if (/model/i.test(message) && /not found|unknown|invalid|does not exist/i.test(message)) {
      return { errorCode: "gemini_api_model_invalid", errorMessage: message, errorMeta: status ? { status } : undefined };
    }
    return {
      errorCode: status ? "gemini_api_request_failed" : "gemini_api_unreachable",
      errorMessage: message,
      errorMeta: status ? { status } : undefined,
    };
  }

  return {
    errorCode: "gemini_api_request_failed",
    errorMessage: String(err),
  };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { onLog, onMeta, context } = ctx;
  const prepared = await prepareApiAdapterRun(ctx, {
    defaultPromptTemplate: DEFAULT_GEMINI_API_PROMPT_TEMPLATE,
  });
  const { cwd, env, model, timeoutSec, prompt, promptMetrics, commandNotes } = prepared;

  const apiKey = readApiKey(env);
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "gemini_api_key_missing",
      errorMessage: "GEMINI_API_KEY is required for gemini_api runs.",
      provider: "gemini",
      biller: "gemini",
      model: model || null,
    };
  }
  if (!model) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "gemini_api_model_missing",
      errorMessage: "Model is required for gemini_api runs.",
      provider: "gemini",
      biller: "gemini",
      model: null,
    };
  }

  const sdk = await loadGeminiSdk();
  const GoogleGenAI = sdk.GoogleGenAI ?? sdk.default?.GoogleGenAI ?? sdk.default;
  const client = new GoogleGenAI({ apiKey });
  const inputPrompt =
    prompt.trim().length > 0
      ? prompt
      : "Continue the assigned Paperclip work and provide a concise progress update.";

  try {
    if (onMeta) {
      await onMeta({
        adapterType: "gemini_api",
        command: "gemini.models.generateContent",
        cwd,
        commandArgs: [`model=${model}`],
        commandNotes,
        prompt: inputPrompt,
        promptMetrics,
        context,
      });
    }

    const response = await client.models.generateContent(
      buildGeminiRequest({
        model,
        prompt: inputPrompt,
        ...(timeoutSec > 0 ? { timeoutMs: timeoutSec * 1000 } : {}),
      }),
    );
    const outputText = await readGeminiText(response);
    if (outputText) {
      await onLog("stdout", outputText.endsWith("\n") ? outputText : `${outputText}\n`);
    }
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      ...mapGeminiResponse(response),
      model,
      summary: summarizeDetail(outputText, 1000),
    };
  } catch (err) {
    const failure = classifyGeminiError(err);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      ...failure,
      provider: "gemini",
      biller: "gemini",
      model,
    };
  }
}

export function buildGeminiRequest(input: {
  model: string;
  prompt: string;
  timeoutMs?: number;
}) {
  return {
    model: input.model,
    contents: input.prompt,
    ...(typeof input.timeoutMs === "number" && input.timeoutMs > 0
      ? { config: { timeout: input.timeoutMs } }
      : {}),
  };
}

export function mapGeminiResponse(response: any) {
  const usage = response?.usageMetadata ?? response?.usage_metadata ?? null;
  const text =
    typeof response?.text === "string" && response.text.trim().length > 0
      ? response.text.trim()
      : typeof response?.response?.text === "string" && response.response.text.trim().length > 0
        ? response.response.text.trim()
        : "";
  return {
    provider: "gemini" as const,
    biller: "gemini" as const,
    billingType: "metered_api" as const,
    model:
      typeof response?.modelVersion === "string" && response.modelVersion.trim().length > 0
        ? response.modelVersion.trim()
        : typeof response?.model === "string" && response.model.trim().length > 0
          ? response.model.trim()
          : null,
    usage: {
      inputTokens:
        typeof usage?.promptTokenCount === "number"
          ? usage.promptTokenCount
          : typeof usage?.prompt_token_count === "number"
            ? usage.prompt_token_count
            : 0,
      outputTokens:
        typeof usage?.candidatesTokenCount === "number"
          ? usage.candidatesTokenCount
          : typeof usage?.candidates_token_count === "number"
            ? usage.candidates_token_count
            : 0,
      ...(typeof usage?.cachedContentTokenCount === "number"
        ? { cachedInputTokens: usage.cachedContentTokenCount }
        : typeof usage?.cached_content_token_count === "number"
          ? { cachedInputTokens: usage.cached_content_token_count }
          : {}),
    },
    summary: summarizeDetail(text, 1000),
  };
}
