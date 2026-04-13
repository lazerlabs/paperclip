import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  prepareApiAdapterRun,
  summarizeDetail,
} from "@paperclipai/adapter-utils/api-adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OPENAI_API_PROMPT_TEMPLATE } from "../index.js";
import { loadOpenAiSdk } from "./sdk.js";

function readApiKey(env: Record<string, string>): string | null {
  const configValue = env.OPENAI_API_KEY;
  if (typeof configValue === "string" && configValue.trim().length > 0) {
    return configValue.trim();
  }
  const hostValue = process.env.OPENAI_API_KEY;
  return typeof hostValue === "string" && hostValue.trim().length > 0 ? hostValue.trim() : null;
}

function readBaseUrl(config: Record<string, unknown>): string | null {
  const value = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  if (!value) return null;
  try {
    return new URL(value.endsWith("/") ? value : `${value}/`).toString();
  } catch {
    return null;
  }
}

function readOrganization(config: Record<string, unknown>): string | null {
  const value = typeof config.organizationId === "string" ? config.organizationId.trim() : "";
  return value || null;
}

function readProject(config: Record<string, unknown>): string | null {
  const value = typeof config.projectId === "string" ? config.projectId.trim() : "";
  return value || null;
}

function responseTextFromResult(result: any): string {
  if (typeof result?.output_text === "string" && result.output_text.trim().length > 0) {
    return result.output_text.trim();
  }
  const output = Array.isArray(result?.output) ? result.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const entry of contents) {
      if (entry?.type === "output_text" && typeof entry.text === "string") {
        chunks.push(entry.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function usageFromResult(result: any) {
  const usage = result?.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const inputTokens =
    typeof usage.input_tokens === "number" && Number.isFinite(usage.input_tokens)
      ? usage.input_tokens
      : 0;
  const outputTokens =
    typeof usage.output_tokens === "number" && Number.isFinite(usage.output_tokens)
      ? usage.output_tokens
      : 0;
  const cachedInputTokens =
    typeof usage.input_tokens_details?.cached_tokens === "number" &&
    Number.isFinite(usage.input_tokens_details.cached_tokens)
      ? usage.input_tokens_details.cached_tokens
      : undefined;
  return {
    inputTokens,
    outputTokens,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
  };
}

function isMissingPreviousResponseError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  const message =
    typeof record.message === "string"
      ? record.message
      : typeof record.error === "object" &&
          record.error !== null &&
          typeof (record.error as Record<string, unknown>).message === "string"
        ? String((record.error as Record<string, unknown>).message)
        : "";
  return /previous[_\s-]?response|unknown response|response .* not found/i.test(message);
}

function classifyOpenAiError(err: unknown): {
  errorCode: string;
  errorMessage: string;
  errorMeta?: Record<string, unknown>;
} {
  if (err instanceof Error) {
    const record = err as Error & { status?: number; code?: string; cause?: unknown };
    const status = typeof record.status === "number" ? record.status : undefined;
    const message = record.message.trim() || "OpenAI request failed";
    if (status === 401) {
      return {
        errorCode: "openai_api_auth_failed",
        errorMessage: message,
        errorMeta: { status },
      };
    }
    if (status === 403) {
      return {
        errorCode: "openai_api_permission_denied",
        errorMessage: message,
        errorMeta: { status },
      };
    }
    if (status === 429) {
      return {
        errorCode: "openai_api_quota_exceeded",
        errorMessage: message,
        errorMeta: { status },
      };
    }
    if (/model/i.test(message) && /not found|does not exist|unknown|invalid/i.test(message)) {
      return {
        errorCode: "openai_api_model_invalid",
        errorMessage: message,
        errorMeta: status ? { status } : undefined,
      };
    }
    return {
      errorCode: status ? "openai_api_request_failed" : "openai_api_unreachable",
      errorMessage: message,
      errorMeta: status ? { status } : undefined,
    };
  }

  return {
    errorCode: "openai_api_request_failed",
    errorMessage: String(err),
  };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { runtime, onLog, onMeta, context } = ctx;
  const prepared = await prepareApiAdapterRun(ctx, {
    defaultPromptTemplate: DEFAULT_OPENAI_API_PROMPT_TEMPLATE,
    resumedSession: Boolean(parseObject(runtime.sessionParams).responseId ?? runtime.sessionId),
  });
  const { cwd, env, model, timeoutSec, prompt, promptMetrics, commandNotes } = prepared;

  const apiKey = readApiKey(env);
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "openai_api_key_missing",
      errorMessage: "OPENAI_API_KEY is required for openai_api runs.",
      provider: "openai",
      biller: "openai",
      model: model || null,
    };
  }

  if (!model) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "openai_api_model_missing",
      errorMessage: "Model is required for openai_api runs.",
      provider: "openai",
      biller: "openai",
      model: null,
    };
  }

  const runtimeSession = parseObject(runtime.sessionParams);
  const responseId =
    typeof runtimeSession.responseId === "string" && runtimeSession.responseId.trim().length > 0
      ? runtimeSession.responseId.trim()
      : typeof runtime.sessionId === "string" && runtime.sessionId.trim().length > 0
        ? runtime.sessionId.trim()
        : null;

  const sdk = await loadOpenAiSdk();
  const OpenAI = sdk.default ?? sdk.OpenAI;
  const baseUrl = readBaseUrl(prepared.config);
  const organization = readOrganization(prepared.config);
  const project = readProject(prepared.config);
  const client = new OpenAI({
    apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
    ...(organization ? { organization } : {}),
    ...(project ? { project } : {}),
    ...(timeoutSec > 0 ? { timeout: timeoutSec * 1000 } : {}),
    maxRetries: 0,
  });

  const inputPrompt =
    prompt.trim().length > 0
      ? prompt
      : "Continue the assigned Paperclip work and provide a concise progress update.";

  const invoke = async (previousResponseId: string | null) => {
    if (onMeta) {
      await onMeta({
        adapterType: "openai_api",
        command: "openai.responses.create",
        cwd,
        commandArgs: previousResponseId ? [`resume=${previousResponseId}`, `model=${model}`] : [`model=${model}`],
        commandNotes,
        prompt: inputPrompt,
        promptMetrics,
        context,
      });
    }
    return client.responses.create({
      model,
      input: inputPrompt,
      store: true,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    });
  };

  let response: any;
  let clearedMissingSession = false;
  try {
    response = await invoke(responseId);
  } catch (err) {
    if (responseId && isMissingPreviousResponseError(err)) {
      clearedMissingSession = true;
      await onLog(
        "stdout",
        `[paperclip] Previous OpenAI response ${responseId} is no longer resumable; retrying with a fresh provider session.\n`,
      );
      try {
        response = await invoke(null);
      } catch (retryErr) {
        const failure = classifyOpenAiError(retryErr);
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          ...failure,
          provider: "openai",
          biller: "openai",
          model,
          clearSession: true,
        };
      }
    } else {
      const failure = classifyOpenAiError(err);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        ...failure,
        provider: "openai",
        biller: "openai",
        model,
      };
    }
  }

  const outputText = responseTextFromResult(response);
  if (outputText) {
    await onLog("stdout", outputText.endsWith("\n") ? outputText : `${outputText}\n`);
  }

  const savedResponseId =
    typeof response?.id === "string" && response.id.trim().length > 0 ? response.id.trim() : null;

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    provider: "openai",
    biller: "openai",
    billingType: "metered_api",
    model,
    usage: usageFromResult(response),
    sessionId: savedResponseId,
    sessionDisplayId: savedResponseId,
    sessionParams: savedResponseId
      ? {
          responseId: savedResponseId,
          sessionId: savedResponseId,
          cwd,
        }
      : null,
    resultJson: savedResponseId ? { id: savedResponseId } : null,
    summary: summarizeDetail(outputText, 1000),
    clearSession: Boolean(clearedMissingSession && !savedResponseId),
  };
}

export function buildOpenAiApiRequest(input: {
  model: string;
  prompt: string;
  previousResponseId: string | null;
}) {
  return {
    model: input.model,
    input: input.prompt,
    store: true,
    ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
  };
}

export function mapOpenAiApiResponse(result: any) {
  const savedResponseId =
    typeof result?.id === "string" && result.id.trim().length > 0 ? result.id.trim() : null;
  return {
    provider: "openai" as const,
    biller: "openai" as const,
    billingType: "metered_api" as const,
    model:
      typeof result?.model === "string" && result.model.trim().length > 0
        ? result.model.trim()
        : null,
    usage: usageFromResult(result),
    summary: responseTextFromResult(result) || null,
    sessionParams: savedResponseId ? { responseId: savedResponseId, sessionId: savedResponseId } : null,
    sessionDisplayId: savedResponseId,
  };
}
