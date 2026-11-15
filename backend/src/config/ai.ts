import { validatePublicUrl } from '../integrations/research/publicFetch';

interface AiEnvironment {
  AI_BASE_URL?: string; AI_API_KEY?: string; AI_MODEL?: string;
  AI_PROTOCOL?: 'chat_completions' | 'responses'; AI_MODELS_URL?: string; AI_TIMEOUT_MS?: number;
  AI_REASONING_EFFORT?: 'none' | 'low' | 'medium' | 'high';
  FREELLMAPI_BASE_URL: string; FREELLMAPI_API_KEY: string; FREELLMAPI_MODEL: string; FREELLMAPI_TIMEOUT_MS: number;
}

export function resolveAiConfiguration(config: AiEnvironment) {
  const generic = [config.AI_BASE_URL, config.AI_API_KEY, config.AI_MODEL, config.AI_PROTOCOL, config.AI_MODELS_URL].some(v => !!v?.trim());
  return {
    baseUrl: (generic ? config.AI_BASE_URL ?? '' : config.FREELLMAPI_BASE_URL).trim().replace(/\/+$/, ''),
    apiKey: (generic ? config.AI_API_KEY ?? '' : config.FREELLMAPI_API_KEY).trim(),
    model: (generic ? config.AI_MODEL ?? '' : config.FREELLMAPI_MODEL).trim(),
    protocol: config.AI_PROTOCOL ?? 'chat_completions' as const,
    modelsUrl: config.AI_MODELS_URL?.trim() || undefined,
    timeoutMs: config.AI_TIMEOUT_MS ?? config.FREELLMAPI_TIMEOUT_MS,
    reasoningEffort: config.AI_REASONING_EFFORT,
  };
}

export function publicAiConfigurationProblems(config: ReturnType<typeof resolveAiConfiguration>): string[] {
  const problems: string[] = [];
  try { const url = validatePublicUrl(config.baseUrl); if (url.search || url.hash) throw new Error(); }
  catch { problems.push('AI_BASE_URL must be a public HTTPS API base URL, without credentials, query strings or a local Desktop address.'); }
  if (config.modelsUrl) {
    try { const url = validatePublicUrl(config.modelsUrl); if (url.search || url.hash) throw new Error(); }
    catch { problems.push('AI_MODELS_URL must be a public HTTPS model-list endpoint without credentials or query strings.'); }
  }
  if (!config.apiKey || /^(?:PASTE_|YOUR_|your[_-])/.test(config.apiKey)) problems.push('Save the public provider key as AI_API_KEY in the hosting environment.');
  if (!config.model || config.model === 'auto') problems.push('Set AI_MODEL to a specific model available through your public API provider.');
  return problems;
}
