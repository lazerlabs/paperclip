export const type = "anthropic_api";
export const DEFAULT_ANTHROPIC_API_MODEL = "claude-sonnet-4-5";

export const models = [
  { id: DEFAULT_ANTHROPIC_API_MODEL, label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
  { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet (latest)" },
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (latest)" },
];

export const agentConfigurationDoc = `# anthropic_api agent configuration

Adapter: anthropic_api

Core fields:
- model (string, required): Anthropic model id
- cwd (string, optional): working directory used for resolving relative instructions paths
- instructionsFilePath (string, optional): markdown instructions file appended to the provider prompt
- promptTemplate (string, optional): heartbeat prompt template rendered by Paperclip
- env (object, optional): adapter environment; use ANTHROPIC_API_KEY for authentication
- timeoutSec (number, optional): request timeout in seconds
- graceSec (number, optional): retained for config parity; not used by in-process API calls

Notes:
- Authentication uses ANTHROPIC_API_KEY from adapter env bindings or the server environment.
- Anthropic runs are stateless in V1; Paperclip does not persist provider-native session state for this adapter.
- Skill sync is unsupported for this adapter in V1.
`;

export const DEFAULT_ANTHROPIC_API_PROMPT_TEMPLATE =
  "You are {{ agent.name }}, a Paperclip agent. Review the current context, complete the highest-priority work in scope, and report concrete progress.";
