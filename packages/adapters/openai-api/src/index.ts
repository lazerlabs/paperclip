export const type = "openai_api";
export const DEFAULT_OPENAI_API_MODEL = "gpt-5";

export const models = [
  { id: DEFAULT_OPENAI_API_MODEL, label: "GPT-5" },
  { id: "gpt-5-mini", label: "GPT-5 Mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { id: "o4-mini", label: "o4-mini" },
];

export const agentConfigurationDoc = `# openai_api agent configuration

Adapter: openai_api

Core fields:
- model (string, required): OpenAI model id
- cwd (string, optional): working directory used for resolving relative instructions paths
- instructionsFilePath (string, optional): markdown instructions file appended to the provider prompt
- promptTemplate (string, optional): heartbeat prompt template rendered by Paperclip
- env (object, optional): adapter environment; use OPENAI_API_KEY for authentication
- timeoutSec (number, optional): request timeout in seconds
- graceSec (number, optional): retained for config parity; not used by in-process API calls

Notes:
- Authentication uses OPENAI_API_KEY from adapter env bindings or the server environment.
- Paperclip persists the last response id when OpenAI exposes resumable state.
- Skill sync is unsupported for this adapter in V1.
`;

export const DEFAULT_OPENAI_API_PROMPT_TEMPLATE =
  "You are {{ agent.name }}, a Paperclip agent. Review the current context, complete the highest-priority work in scope, and report concrete progress.";
