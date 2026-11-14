import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

export interface FreeLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const ModelsResponse = z.object({ data: z.array(z.object({ id: z.string() })) });
const CompletionResponse = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ total_tokens: z.number().optional() }).optional(),
});

/** OpenAI-compatible transport. Never forward upstream bodies or request headers to logs. */
export function createFreeLlmClient(config: FreeLlmConfig, transport: typeof fetch = fetch) {
  async function request(path: string, body?: unknown): Promise<unknown> {
    const key = config.apiKey.trim();
    if (!key || key === 'PASTE_YOUR_UNIFIED_KEY_HERE') {
      throw new AppError('Set FREELLMAPI_API_KEY in the project .env file.', 503, 'AI_NOT_CONFIGURED');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await transport(`${config.baseUrl.replace(/\/+$/, '')}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      if (response.status === 401 || response.status === 403) {
        throw new AppError('FreeLLMAPI rejected the configured key.', 503, 'AI_AUTHENTICATION_FAILED');
      }
      if (response.status === 429) {
        throw new AppError('FreeLLMAPI is rate limited; try again later.', 503, 'AI_RATE_LIMITED');
      }
      if (!response.ok) {
        throw new AppError('FreeLLMAPI could not complete the request.', 502, 'AI_UPSTREAM_ERROR');
      }
      try {
        return await response.json();
      } catch {
        if (controller.signal.aborted) throw new AppError('FreeLLMAPI request timed out.', 504, 'AI_TIMEOUT');
        throw new AppError('FreeLLMAPI returned invalid JSON.', 502, 'AI_INVALID_RESPONSE');
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) throw new AppError('FreeLLMAPI request timed out.', 504, 'AI_TIMEOUT');
      throw new AppError('Cannot reach FreeLLMAPI. Check that the desktop app is running.', 503, 'AI_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }

  async function listModels(): Promise<string[]> {
    const parsed = ModelsResponse.safeParse(await request('/models'));
    if (!parsed.success) throw new AppError('FreeLLMAPI returned an invalid model list.', 502, 'AI_INVALID_RESPONSE');
    return parsed.data.data.map((model) => model.id);
  }

  async function generateText(messages: ChatMessage[], maxTokens: number = 512) {
    if (!messages.length || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
      throw new AppError('Invalid AI request parameters.', 400, 'AI_INVALID_INPUT');
    }
    const parsed = CompletionResponse.safeParse(await request('/chat/completions', {
      model: config.model, messages, max_tokens: maxTokens, stream: false,
    }));
    if (!parsed.success) throw new AppError('FreeLLMAPI returned an invalid completion.', 502, 'AI_INVALID_RESPONSE');
    const reply = parsed.data.choices[0].message.content;
    if (!reply?.trim()) throw new AppError('FreeLLMAPI returned no text.', 502, 'AI_EMPTY_RESPONSE');
    return { model: parsed.data.model, reply, totalTokens: parsed.data.usage?.total_tokens };
  }

  return { listModels, generateText };
}

export const freeLlmClient = createFreeLlmClient({
  baseUrl: env.FREELLMAPI_BASE_URL,
  apiKey: env.FREELLMAPI_API_KEY,
  model: env.FREELLMAPI_MODEL,
  timeoutMs: env.FREELLMAPI_TIMEOUT_MS,
});
