export const type = "gemini_api";
export const DEFAULT_GEMINI_API_MODEL = "gemini-2.5-pro";

export const models = [
  { id: DEFAULT_GEMINI_API_MODEL, label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

export const agentConfigurationDoc = `# gemini_api agent configuration

Adapter: gemini_api

Core fields:
- model (string, required): Gemini model id
- cwd (string, optional): working directory used for resolving relative instructions paths
- instructionsFilePath (string, optional): markdown instructions file appended to the provider prompt
- promptTemplate (string, optional): heartbeat prompt template rendered by Paperclip
- env (object, optional): adapter environment; use GEMINI_API_KEY for authentication
- timeoutSec (number, optional): request timeout in seconds
- graceSec (number, optional): retained for config parity; not used by in-process API calls

Notes:
- Authentication uses GEMINI_API_KEY from adapter env bindings or the server environment.
- Gemini runs are stateless in V1; Paperclip does not persist provider-native session state for this adapter.
- Skill sync is unsupported for this adapter in V1.
`;

export const DEFAULT_GEMINI_API_PROMPT_TEMPLATE =
  "You are {{ agent.name }}, a Paperclip agent. Review the current context, complete the highest-priority work in scope, and report concrete progress.";
