import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  readResolvedEnvBindings,
  summarizeDetail,
  summarizeEnvironmentStatus,
} from "@paperclipai/adapter-utils/api-adapter-utils";
import { ensureAbsoluteDirectory, parseObject } from "@paperclipai/adapter-utils/server-utils";

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

function classifyResponse(status: number, body: string): AdapterEnvironmentCheck {
  const detail = summarizeDetail(body) ?? `HTTP ${status}`;
  if (status === 401) {
    return {
      code: "openai_compatible_auth_failed",
      level: "error",
      message: "The compatible endpoint rejected the configured API key.",
      detail,
      hint: "Verify OPENAI_API_KEY and any gateway-specific auth expectations.",
    };
  }
  if (status === 403) {
    return {
      code: "openai_compatible_permission_denied",
      level: "error",
      message: "The compatible endpoint denied access to this request.",
      detail,
      hint: "Check model entitlements and any provider-specific permission headers.",
    };
  }
  if (status === 429) {
    return {
      code: "openai_compatible_quota_exceeded",
      level: "warn",
      message: "The compatible endpoint reported a rate-limit or quota issue.",
      detail,
      hint: "Check provider billing, spend caps, and rate limits.",
    };
  }
  if (/model/i.test(body) && /not found|unknown|invalid|does not exist/i.test(body)) {
    return {
      code: "openai_compatible_model_invalid",
      level: "error",
      message: "The configured model is invalid or unavailable on the compatible endpoint.",
      detail,
      hint: "Pick a model id supported by the configured baseUrl.",
    };
  }
  return {
    code: "openai_compatible_probe_failed",
    level: status >= 500 ? "warn" : "error",
    message: "Compatible endpoint hello probe failed.",
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
      code: "openai_compatible_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "openai_compatible_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const env = readResolvedEnvBindings(config.env);

  const apiKey = readApiKey(env);
  if (!apiKey) {
    checks.push({
      code: "openai_compatible_key_missing",
      level: "error",
      message: "OPENAI_API_KEY is required.",
      hint: "Bind OPENAI_API_KEY through adapter env or the server environment.",
    });
  }

  const model = typeof config.model === "string" ? config.model.trim() : "";
  if (!model) {
    checks.push({
      code: "openai_compatible_model_missing",
      level: "error",
      message: "Model is required.",
      hint: "Enter a model id supported by the compatible endpoint.",
    });
  }

  const baseUrl = readBaseUrl(config);
  if (!baseUrl) {
    checks.push({
      code: "openai_compatible_base_url_invalid",
      level: "error",
      message: "baseUrl is required and must be a valid URL.",
      hint: "Use the provider base URL, for example https://host.example/v1.",
    });
  }

  const canProbe = checks.every((check) => check.level !== "error");
  if (canProbe) {
    const endpoint = new URL("chat/completions", baseUrl!).toString();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...readStaticHeaders(config),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Respond with hello." }],
        }),
      });
      const body = await response.text();
      if (!response.ok) {
        checks.push(classifyResponse(response.status, body));
      } else {
        checks.push({
          code: /\bhello\b/i.test(body)
            ? "openai_compatible_probe_passed"
            : "openai_compatible_probe_unexpected_output",
          level: /\bhello\b/i.test(body) ? "info" : "warn",
          message: /\bhello\b/i.test(body)
            ? "Compatible endpoint hello probe succeeded."
            : "Compatible endpoint responded, but the hello probe returned unexpected output.",
          detail: summarizeDetail(body) ?? undefined,
        });
      }
    } catch (err) {
      checks.push({
        code: "openai_compatible_unreachable",
        level: "error",
        message: "Compatible endpoint could not be reached.",
        detail: summarizeDetail(err instanceof Error ? err.message : String(err)),
        hint: "Check baseUrl, outbound network access, and DNS resolution from the Paperclip server.",
      });
    }
  }

  return {
    adapterType: "openai_compatible",
    status: summarizeEnvironmentStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
