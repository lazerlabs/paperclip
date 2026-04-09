import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  prepareApiAdapterRun,
  summarizeDetail,
} from "@paperclipai/adapter-utils/api-adapter-utils";
import { inferOpenAiCompatibleBiller } from "@paperclipai/adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OPENAI_COMPATIBLE_PROMPT_TEMPLATE } from "../index.js";

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

function readStaticHeaders(config: Record<string, unknown>): Record<string, string> {
  const headers = parseObject(config.headers);
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.trim().length > 0) {
      next[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      next[key] = String(value);
    }
  }
  return next;
}

function extractChatCompletionText(parsed: Record<string, unknown>): string {
  const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
  for (const choice of choices) {
    const message = choice && typeof choice === "object" ? (choice as Record<string, unknown>).message : null;
    if (!message || typeof message !== "object") continue;
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim().length > 0) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((entry) => {
          if (entry && typeof entry === "object" && (entry as Record<string, unknown>).type === "text") {
            return typeof (entry as Record<string, unknown>).text === "string"
              ? String((entry as Record<string, unknown>).text)
              : "";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

function usageFromChatCompletion(parsed: Record<string, unknown>) {
  const usage = parsed.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const inputTokens =
    typeof record.prompt_tokens === "number" && Number.isFinite(record.prompt_tokens)
      ? record.prompt_tokens
      : 0;
  const outputTokens =
    typeof record.completion_tokens === "number" && Number.isFinite(record.completion_tokens)
      ? record.completion_tokens
      : 0;
  const cachedInputTokens =
    typeof record.prompt_tokens_details === "object" &&
    record.prompt_tokens_details !== null &&
    typeof (record.prompt_tokens_details as Record<string, unknown>).cached_tokens === "number"
      ? Number((record.prompt_tokens_details as Record<string, unknown>).cached_tokens)
      : undefined;
  return {
    inputTokens,
    outputTokens,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
  };
}

function classifyError(status: number | null, body: string | null) {
  const detail = summarizeDetail(body ?? "");
  if (status === 401) {
    return {
      errorCode: "openai_compatible_auth_failed",
      errorMessage: detail ?? "The compatible endpoint rejected the configured API key.",
      errorMeta: { status },
    };
  }
  if (status === 403) {
    return {
      errorCode: "openai_compatible_permission_denied",
      errorMessage: detail ?? "The compatible endpoint denied access to this request.",
      errorMeta: { status },
    };
  }
  if (status === 429) {
    return {
      errorCode: "openai_compatible_quota_exceeded",
      errorMessage: detail ?? "The compatible endpoint reported rate limits or exhausted quota.",
      errorMeta: { status },
    };
  }
  if (body && /model/i.test(body) && /not found|unknown|invalid|does not exist/i.test(body)) {
    return {
      errorCode: "openai_compatible_model_invalid",
      errorMessage: detail ?? "The configured model is invalid or unavailable.",
      errorMeta: status ? { status } : undefined,
    };
  }
  return {
    errorCode: status ? "openai_compatible_request_failed" : "openai_compatible_unreachable",
    errorMessage: detail ?? "The compatible endpoint request failed.",
    errorMeta: status ? { status } : undefined,
  };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { onLog, onMeta, context } = ctx;
  const prepared = await prepareApiAdapterRun(ctx, {
    defaultPromptTemplate: DEFAULT_OPENAI_COMPATIBLE_PROMPT_TEMPLATE,
  });
  const { config, cwd, env, model, timeoutSec, prompt, promptMetrics, commandNotes } = prepared;

  const apiKey = readApiKey(env);
  const baseUrl = readBaseUrl(config);
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "openai_compatible_key_missing",
      errorMessage: "OPENAI_API_KEY is required for openai_compatible runs.",
      provider: "openai_compatible",
      biller: "openai_compatible",
      model: model || null,
    };
  }
  if (!model) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "openai_compatible_model_missing",
      errorMessage: "Model is required for openai_compatible runs.",
      provider: "openai_compatible",
      biller: "openai_compatible",
      model: null,
    };
  }
  if (!baseUrl) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "openai_compatible_base_url_missing",
      errorMessage: "A valid baseUrl is required for openai_compatible runs.",
      provider: "openai_compatible",
      biller: "openai_compatible",
      model,
    };
  }

  const endpoint = new URL("chat/completions", baseUrl).toString();
  const staticHeaders = readStaticHeaders(config);
  const inputPrompt =
    prompt.trim().length > 0
      ? prompt
      : "Continue the assigned Paperclip work and provide a concise progress update.";
  const biller = inferOpenAiCompatibleBiller(
    {
      ...process.env,
      ...env,
      OPENAI_BASE_URL: baseUrl,
    },
    "openai_compatible",
  );

  if (onMeta) {
    await onMeta({
      adapterType: "openai_compatible",
      command: "http POST /chat/completions",
      cwd,
      commandArgs: [`model=${model}`, endpoint],
      commandNotes,
      prompt: inputPrompt,
      promptMetrics,
      context,
    });
  }

  const abortSignal = timeoutSec > 0 ? AbortSignal.timeout(timeoutSec * 1000) : undefined;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...staticHeaders,
      },
      body: JSON.stringify(buildOpenAiCompatibleRequest({ model, prompt: inputPrompt })),
      signal: abortSignal,
    });
    const body = await response.text();
    if (!response.ok) {
      const failure = classifyError(response.status, body);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        ...failure,
        provider: "openai_compatible",
        biller,
        model,
      };
    }

    const parsed = JSON.parse(body) as Record<string, unknown>;
    const outputText = extractChatCompletionText(parsed);
    if (outputText) {
      await onLog("stdout", outputText.endsWith("\n") ? outputText : `${outputText}\n`);
    }
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      ...mapOpenAiCompatibleResponse(parsed),
      biller,
      model,
      summary: summarizeDetail(outputText, 1000),
    };
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    const failure = classifyError(null, err instanceof Error ? err.message : String(err));
    return {
      exitCode: 1,
      signal: null,
      timedOut,
      ...failure,
      provider: "openai_compatible",
      biller,
      model,
    };
  }
}

export function buildOpenAiCompatibleRequest(input: {
  model: string;
  prompt: string;
}) {
  return {
    model: input.model,
    messages: [{ role: "user" as const, content: input.prompt }],
    stream: false,
  };
}

export function mapOpenAiCompatibleResponse(parsed: Record<string, unknown>) {
  return {
    provider: "openai_compatible" as const,
    biller: "openai_compatible" as const,
    billingType: "metered_api" as const,
    model:
      typeof parsed.model === "string" && parsed.model.trim().length > 0
        ? parsed.model.trim()
        : null,
    usage: usageFromChatCompletion(parsed),
    resultJson:
      typeof parsed.id === "string" && parsed.id.trim().length > 0 ? { id: parsed.id } : null,
    summary: summarizeDetail(extractChatCompletionText(parsed), 1000),
  };
}
