import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestResult,
  AdapterExecutionContext,
} from "./types.js";
import {
  asNumber,
  asString,
  ensureAbsoluteDirectory,
  joinPromptSections,
  parseObject,
  renderPaperclipWakePrompt,
  renderTemplate,
} from "./server-utils.js";

export interface PreparedApiAdapterRun {
  config: Record<string, unknown>;
  cwd: string;
  model: string;
  timeoutSec: number;
  graceSec: number;
  env: Record<string, string>;
  prompt: string;
  promptMetrics: Record<string, number>;
  commandNotes: string[];
}

export function summarizeEnvironmentStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

export function summarizeDetail(value: string | null | undefined, max = 240): string | null {
  const trimmed = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function readResolvedEnvBindings(envValue: unknown): Record<string, string> {
  const envConfig = parseObject(envValue);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") {
      env[key] = value;
      continue;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (record.type === "plain" && typeof record.value === "string") {
      env[key] = record.value;
    }
  }
  return env;
}

export async function prepareApiAdapterRun(
  ctx: AdapterExecutionContext,
  options: {
    defaultPromptTemplate: string;
    resumedSession?: boolean;
  },
): Promise<PreparedApiAdapterRun> {
  const { config: rawConfig, context, agent, runId, onLog } = ctx;
  const config = parseObject(rawConfig);
  const cwd = asString(config.cwd, process.cwd());
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const env = readResolvedEnvBindings(config.env);

  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  const resolvedInstructionsFilePath =
    instructionsFilePath.length > 0
      ? (path.isAbsolute(instructionsFilePath)
        ? instructionsFilePath
        : path.resolve(cwd, instructionsFilePath))
      : "";
  const instructionsDir = resolvedInstructionsFilePath
    ? `${path.dirname(resolvedInstructionsFilePath)}/`
    : "";

  let instructionsPrefix = "";
  if (resolvedInstructionsFilePath) {
    try {
      const instructionsContents = await fs.readFile(resolvedInstructionsFilePath, "utf8");
      instructionsPrefix =
        `${instructionsContents}\n\n` +
        `The above agent instructions were loaded from ${resolvedInstructionsFilePath}. ` +
        `Resolve any relative file references from ${instructionsDir}.\n\n`;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await onLog(
        "stdout",
        `[paperclip] Warning: could not read agent instructions file "${resolvedInstructionsFilePath}": ${reason}\n`,
      );
    }
  }

  const promptTemplate = asString(config.promptTemplate, options.defaultPromptTemplate);
  const bootstrapPromptTemplate = asString(config.bootstrapPromptTemplate, "");
  const model = asString(config.model, "").trim();
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 15);
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };

  const renderedBootstrapPrompt = bootstrapPromptTemplate.trim().length > 0
    ? renderTemplate(bootstrapPromptTemplate, templateData).trim()
    : "";
  const renderedPrompt = renderTemplate(promptTemplate, templateData).trim();
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, {
    resumedSession: options.resumedSession,
  });
  const sessionHandoffNote = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const prompt = joinPromptSections([
    instructionsPrefix,
    renderedBootstrapPrompt,
    wakePrompt,
    sessionHandoffNote,
    renderedPrompt,
  ]);

  const commandNotes = (() => {
    if (!resolvedInstructionsFilePath) return ["Paperclip assembled the provider prompt in-process."];
    if (instructionsPrefix.length > 0) {
      return [
        "Paperclip assembled the provider prompt in-process.",
        `Loaded agent instructions from ${resolvedInstructionsFilePath}.`,
      ];
    }
    return [
      "Paperclip assembled the provider prompt in-process.",
      `Configured instructionsFilePath ${resolvedInstructionsFilePath}, but the file could not be read; continuing without injected instructions.`,
    ];
  })();

  return {
    config,
    cwd,
    model,
    timeoutSec,
    graceSec,
    env,
    prompt,
    promptMetrics: {
      promptChars: prompt.length,
      instructionsChars: instructionsPrefix.length,
      bootstrapPromptChars: renderedBootstrapPrompt.length,
      wakePromptChars: wakePrompt.length,
      sessionHandoffChars: sessionHandoffNote.length,
      heartbeatPromptChars: renderedPrompt.length,
    },
    commandNotes,
  };
}
