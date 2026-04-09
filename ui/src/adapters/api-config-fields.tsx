import type { AdapterConfigFieldsProps } from "./types";
import {
  DraftInput,
  Field,
  help,
} from "../components/agent-config-primitives";
import { ChoosePathButton } from "../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (for example AGENTS.md) that Paperclip prepends to the provider prompt at runtime.";

function formatHeaders(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function parseHeadersJson(value: string): Record<string, string> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const headers: Record<string, string> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        headers[key] = entry;
      } else if (typeof entry === "number" || typeof entry === "boolean") {
        headers[key] = String(entry);
      }
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  } catch {
    return undefined;
  }
}

export function ApiAdapterConfigFields({
  adapterType,
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const isOpenAiCompatible = adapterType === "openai_compatible";

  return (
    <>
      <Field label="Working directory" hint={help.cwd}>
        <div className="flex items-center gap-2">
          <DraftInput
            value={
              isCreate
                ? values!.cwd
                : eff("adapterConfig", "cwd", String(config.cwd ?? ""))
            }
            onCommit={(value) =>
              isCreate
                ? set!({ cwd: value })
                : mark("adapterConfig", "cwd", value || undefined)
            }
            immediate
            className={inputClass}
            placeholder="/path/to/project"
          />
          <ChoosePathButton />
        </div>
      </Field>

      {!hideInstructionsFile && (
        <Field label="Agent instructions file" hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(value) =>
                isCreate
                  ? set!({ instructionsFilePath: value })
                  : mark("adapterConfig", "instructionsFilePath", value || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}

      {isOpenAiCompatible && (
        <>
          <Field label="Base URL" hint={help.baseUrl}>
            <DraftInput
              value={
                isCreate
                  ? values!.baseUrl ?? ""
                  : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? ""))
              }
              onCommit={(value) =>
                isCreate
                  ? set!({ baseUrl: value })
                  : mark("adapterConfig", "baseUrl", value || undefined)
              }
              immediate
              className={inputClass}
              placeholder="https://host.example/v1"
            />
          </Field>

          <Field label="Static headers JSON" hint={help.staticHeadersJson}>
            <DraftInput
              value={
                isCreate
                  ? values!.headersJson ?? ""
                  : formatHeaders(
                      eff("adapterConfig", "headers", config.headers ?? undefined),
                    )
              }
              onCommit={(value) =>
                isCreate
                  ? set!({ headersJson: value })
                  : mark("adapterConfig", "headers", parseHeadersJson(value))
              }
              immediate
              className={inputClass}
              placeholder='{"HTTP-Referer":"https://example.com"}'
            />
          </Field>
        </>
      )}
    </>
  );
}
