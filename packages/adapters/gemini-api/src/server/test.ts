import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { summarizeDetail, summarizeEnvironmentStatus } from "@paperclipai/adapter-utils/api-adapter-utils";
import { ensureAbsoluteDirectory, parseObject } from "@paperclipai/adapter-utils/server-utils";

function readApiKey(env: Record<string, string>): string | null {
  const configValue = env.GEMINI_API_KEY;
  if (typeof configValue === "string" && configValue.trim().length > 0) {
    return configValue.trim();
  }
  const hostValue = process.env.GEMINI_API_KEY;
  return typeof hostValue === "string" && hostValue.trim().length > 0 ? hostValue.trim() : null;
}

function classifyResponse(status: number, body: string): AdapterEnvironmentCheck {
  const detail = summarizeDetail(body) ?? `HTTP ${status}`;
  if (status === 401) {
    return {
      code: "gemini_api_auth_failed",
      level: "error",
      message: "Gemini rejected the configured API key.",
      detail,
      hint: "Verify GEMINI_API_KEY and provider project routing.",
    };
  }
  if (status === 403) {
    return {
      code: "gemini_api_permission_denied",
      level: "error",
      message: "Gemini denied access to this request.",
      detail,
      hint: "Check model availability, project permissions, and region restrictions.",
    };
  }
  if (status === 429) {
    return {
      code: "gemini_api_quota_exceeded",
      level: "warn",
      message: "Gemini reported a rate-limit or quota issue.",
      detail,
      hint: "Check Gemini billing, spend caps, and provider rate limits.",
    };
  }
  if (/model/i.test(body) && /not found|unknown|invalid|does not exist/i.test(body)) {
    return {
      code: "gemini_api_model_invalid",
      level: "error",
      message: "The configured Gemini model is invalid or unavailable.",
      detail,
      hint: "Pick a supported Gemini model id.",
    };
  }
  return {
    code: "gemini_api_probe_failed",
    level: status >= 500 ? "warn" : "error",
    message: "Gemini hello probe failed.",
    detail,
  };
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const cwd =
    typeof config.cwd === "string" && config.cwd.trim().length > 0 ? config.cwd.trim() : process.cwd();
  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    checks.push({
      code: "gemini_api_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "gemini_api_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }

  const apiKey = readApiKey(env);
  if (!apiKey) {
    checks.push({
      code: "gemini_api_key_missing",
      level: "error",
      message: "GEMINI_API_KEY is required.",
      hint: "Bind GEMINI_API_KEY through adapter env or the server environment.",
    });
  }

  const model = typeof config.model === "string" ? config.model.trim() : "";
  if (!model) {
    checks.push({
      code: "gemini_api_model_missing",
      level: "error",
      message: "Model is required.",
      hint: "Select or enter a Gemini model before testing the environment.",
    });
  }

  const canProbe = checks.every((check) => check.level !== "error");
  if (canProbe) {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
      `:generateContent?key=${encodeURIComponent(apiKey!)}`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Respond with hello." }] }],
          generationConfig: { maxOutputTokens: 32 },
        }),
      });
      const body = await response.text();
      if (!response.ok) {
        checks.push(classifyResponse(response.status, body));
      } else {
        checks.push({
          code: /\bhello\b/i.test(body)
            ? "gemini_api_probe_passed"
            : "gemini_api_probe_unexpected_output",
          level: /\bhello\b/i.test(body) ? "info" : "warn",
          message: /\bhello\b/i.test(body)
            ? "Gemini hello probe succeeded."
            : "Gemini responded, but the hello probe returned unexpected output.",
          detail: summarizeDetail(body) ?? undefined,
        });
      }
    } catch (err) {
      checks.push({
        code: "gemini_api_unreachable",
        level: "error",
        message: "Gemini endpoint could not be reached.",
        detail: summarizeDetail(err instanceof Error ? err.message : String(err)),
        hint: "Check outbound network access and DNS resolution from the Paperclip server.",
      });
    }
  }

  return {
    adapterType: "gemini_api",
    status: summarizeEnvironmentStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
