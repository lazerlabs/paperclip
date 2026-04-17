export const type = "openai_compatible";
export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# openai_compatible agent configuration

Adapter: openai_compatible

Core fields:
- model (string, required): target model id accepted by the compatible endpoint
- baseUrl (string, required): base API URL (for example https://host.example/v1)
- headers (object, optional): additional static request headers
- cwd (string, optional): working directory used for resolving relative instructions paths
- instructionsFilePath (string, optional): markdown instructions file appended to the provider prompt
- promptTemplate (string, optional): heartbeat prompt template rendered by Paperclip
- env (object, optional): adapter environment; use OPENAI_API_KEY for authentication
- timeoutSec (number, optional): request timeout in seconds
- graceSec (number, optional): retained for config parity; not used by in-process API calls

Notes:
- Paperclip calls a Chat Completions-compatible endpoint using Authorization: Bearer OPENAI_API_KEY.
- Static headers are optional and stored directly in adapter config.
- Runs are stateless in V1; Paperclip does not persist provider-native session state for this adapter.
- Skill sync is unsupported for this adapter in V1.
`;

export const DEFAULT_OPENAI_COMPATIBLE_PROMPT_TEMPLATE =
  "You are {{ agent.name }}, a Paperclip agent. Review the current context, complete the highest-priority work in scope, and report concrete progress.";
