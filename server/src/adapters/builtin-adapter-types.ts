/**
 * Adapter types shipped with Paperclip. External plugins must not replace these.
 */
export const BUILTIN_ADAPTER_TYPES = new Set([
  "claude_local",
  "codex_local",
  "openai_api",
  "anthropic_api",
  "cursor",
  "gemini_local",
  "gemini_api",
  "openai_compatible",
  "openclaw_gateway",
  "opencode_local",
  "pi_local",
  "hermes_local",
  "process",
  "http",
]);
