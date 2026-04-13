import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  firstNonEmptyLine,
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

function readBaseUrl(config: Record<string, unknown>): string {
  const value = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  if (!value) return "https://api.openai.com/v1/";
  try {
    return new URL(value.endsWith("/") ? value : `${value}/`).toString();
  } catch {
    return "https://api.openai.com/v1/";
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

function classifyResponse(status: number, body: string): AdapterEnvironmentCheck {
  const detail = summarizeDetail(body) ?? `HTTP ${status}`;
  if (status === 401) {
    return {
      code: "openai_api_auth_failed",
      level: "error",
      message: "OpenAI rejected the configured API key.",
      detail,
      hint: "Verify OPENAI_API_KEY is valid and belongs to the intended OpenAI project.",
    };
  }
  if (status === 403) {
    return {
      code: "openai_api_permission_denied",
      level: "error",
      message: "OpenAI denied access to this request.",
      detail,
      hint: "Check project permissions, organization routing, and any model access restrictions.",
    };
  }
  if (status === 429) {
    return {
      code: "openai_api_quota_exceeded",
      level: "warn",
      message: "OpenAI reported rate limits or exhausted quota.",
      detail,
      hint: "Check provider quota, billing, and project-level rate limits.",
    };
  }
  if (/model/i.test(body) && /not found|does not exist|unknown|invalid/i.test(body)) {
    return {
      code: "openai_api_model_invalid",
      level: "error",
      message: "The configured OpenAI model is invalid or unavailable.",
      detail,
      hint: "Pick a supported model id for this OpenAI project.",
    };
  }
  return {
    code: "openai_api_probe_failed",
    level: status >= 500 ? "warn" : "error",
    message: "OpenAI hello probe failed.",
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
      code: "openai_api_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "openai_api_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const env = readResolvedEnvBindings(config.env);

  const apiKey = readApiKey(env);
  if (!apiKey) {
    checks.push({
      code: "openai_api_key_missing",
      level: "error",
      message: "OPENAI_API_KEY is required.",
      hint: "Bind OPENAI_API_KEY through adapter env or the server environment.",
    });
  }

  const model = typeof config.model === "string" ? config.model.trim() : "";
  if (!model) {
    checks.push({
      code: "openai_api_model_missing",
      level: "error",
      message: "Model is required.",
      hint: "Select or enter an OpenAI model before testing the environment.",
    });
  }

  const canProbe = checks.every((check) => check.level !== "error");
  if (canProbe) {
    try {
      const response = await fetch(new URL("responses", readBaseUrl(config)).toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(readOrganization(config) ? { "OpenAI-Organization": readOrganization(config)! } : {}),
          ...(readProject(config) ? { "OpenAI-Project": readProject(config)! } : {}),
        },
        body: JSON.stringify({
          model,
          input: "Respond with hello.",
          max_output_tokens: 32,
        }),
      });
      const body = await response.text();
      if (!response.ok) {
        checks.push(classifyResponse(response.status, body));
      } else {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const outputText =
          typeof parsed.output_text === "string" && parsed.output_text.trim().length > 0
            ? parsed.output_text.trim()
            : firstNonEmptyLine(body);
        checks.push({
          code: /\bhello\b/i.test(outputText)
            ? "openai_api_probe_passed"
            : "openai_api_probe_unexpected_output",
          level: /\bhello\b/i.test(outputText) ? "info" : "warn",
          message: /\bhello\b/i.test(outputText)
            ? "OpenAI hello probe succeeded."
            : "OpenAI responded, but the hello probe returned unexpected output.",
          ...(outputText ? { detail: summarizeDetail(outputText) ?? undefined } : {}),
        });
      }
    } catch (err) {
      checks.push({
        code: "openai_api_unreachable",
        level: "error",
        message: "OpenAI endpoint could not be reached.",
        detail: summarizeDetail(err instanceof Error ? err.message : String(err)),
        hint: "Check outbound network access and DNS resolution from the Paperclip server.",
      });
    }
  }

  return {
    adapterType: "openai_api",
    status: summarizeEnvironmentStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
