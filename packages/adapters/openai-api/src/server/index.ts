export { execute } from "./execute.js";
export { listModels } from "./models.js";
export { testEnvironment } from "./test.js";
import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const responseId =
      readNonEmptyString(record.responseId) ??
      readNonEmptyString(record.response_id) ??
      readNonEmptyString(record.sessionId) ??
      readNonEmptyString(record.session_id);
    if (!responseId) return null;
    const cwd =
      readNonEmptyString(record.cwd) ??
      readNonEmptyString(record.workdir) ??
      readNonEmptyString(record.folder);
    return {
      responseId,
      sessionId: responseId,
      ...(cwd ? { cwd } : {}),
    };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const responseId =
      readNonEmptyString(params.responseId) ??
      readNonEmptyString(params.response_id) ??
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id);
    if (!responseId) return null;
    const cwd =
      readNonEmptyString(params.cwd) ??
      readNonEmptyString(params.workdir) ??
      readNonEmptyString(params.folder);
    return {
      responseId,
      sessionId: responseId,
      ...(cwd ? { cwd } : {}),
    };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return (
      readNonEmptyString(params.responseId) ??
      readNonEmptyString(params.response_id) ??
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id)
    );
  },
};
