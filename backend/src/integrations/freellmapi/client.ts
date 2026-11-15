import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { resolveAiConfiguration } from '../../config/ai';

export interface FreeLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  protocol?: 'chat_completions' | 'responses';
  modelsUrl?: string;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const ModelsResponse = z.object({ data: z.array(z.object({ id: z.string(), supported_parameters: z.array(z.string()).optional() })) });
const CompletionResponse = z.object({
  id: z.string().optional(),
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish(),
    tool_calls: z.array(z.object({ type: z.literal('function'), function: z.object({ name: z.string(), arguments: z.string() }) })).optional(),
  }), finish_reason: z.string().nullable().optional() })).min(1),
  usage: z.object({ total_tokens: z.number().optional() }).optional(),
});
const ResponsesResponse = z.object({
  id: z.string().optional(),
  model: z.string(), status: z.string().optional(),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })),
  usage: z.object({ total_tokens: z.number().optional() }).optional(),
});

/** OpenAI-compatible transport. Never forward upstream bodies or request headers to logs. */
export function createFreeLlmClient(config: FreeLlmConfig, transport: typeof fetch = fetch) {
  async function request(path: string, body?: unknown, exactUrl?: string): Promise<unknown> {
    const key = config.apiKey.trim();
    if (!key || key === 'PASTE_YOUR_UNIFIED_KEY_HERE') {
      throw new AppError('Configure the backend AI API key in the hosting environment or local .env file.', 503, 'AI_NOT_CONFIGURED');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await transport(exactUrl ?? `${config.baseUrl.replace(/\/+$/, '')}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      if (response.status === 401 || response.status === 403) {
        throw new AppError('The AI provider rejected this key or model access. Check the provider configuration.', 503, 'AI_AUTHENTICATION_FAILED');
      }
      if (response.status === 429) {
        throw new AppError('The AI provider is rate limited; try again later.', 503, 'AI_RATE_LIMITED');
      }
      if (response.status === 402) throw new AppError('The AI provider reports insufficient credits or an exhausted account budget.', 503, 'AI_CREDITS_REQUIRED');
      if (response.status === 404) throw new AppError('The configured AI model or API endpoint is unavailable. Check the backend provider settings.', 503, 'AI_MODEL_UNAVAILABLE');
      if (!response.ok) {
        throw new AppError('The AI provider could not complete the request. Check its model, API protocol and account limits.', 502, 'AI_UPSTREAM_ERROR');
      }
      try {
        return await response.json();
      } catch {
        if (controller.signal.aborted) throw new AppError('The AI provider request timed out.', 504, 'AI_TIMEOUT');
        throw new AppError('The AI provider returned invalid JSON.', 502, 'AI_INVALID_RESPONSE');
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) throw new AppError('The AI provider request timed out.', 504, 'AI_TIMEOUT');
      throw new AppError('Cannot reach the configured AI provider. Check the backend API URL and provider availability.', 503, 'AI_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }

  async function listModels(): Promise<string[]> {
    const parsed = ModelsResponse.safeParse(await request('/models', undefined, config.modelsUrl));
    if (!parsed.success) throw new AppError('The AI provider returned an invalid model list.', 502, 'AI_INVALID_RESPONSE');
    return parsed.data.data.map((model) => model.id);
  }

  async function supportedParameters(): Promise<string[]> {
    const parsed = ModelsResponse.safeParse(await request('/models', undefined, config.modelsUrl));
    if (!parsed.success) throw new AppError('The AI provider returned an invalid model list.', 502, 'AI_INVALID_RESPONSE');
    return parsed.data.data.find(model => model.id === config.model)?.supported_parameters ?? [];
  }

  async function generateText(messages: ChatMessage[], maxTokens: number = 512, options: {
    includeMetadata?: boolean; structuredTool?: { name: string; schema: Record<string, unknown> };
  } = {}) {
    if (!messages.length || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 12000) {
      throw new AppError('Invalid AI request parameters.', 400, 'AI_INVALID_INPUT');
    }
    if (!config.baseUrl || !config.model) throw new AppError('Configure the backend AI base URL and model.', 503, 'AI_NOT_CONFIGURED');
    if (config.protocol === 'responses') {
      const parsed = ResponsesResponse.safeParse(await request('/responses', { model: config.model, input: messages, max_output_tokens: maxTokens, store: false }));
      if (!parsed.success || (parsed.data.status && parsed.data.status !== 'completed')) throw new AppError('The AI provider returned an incomplete response.', 502, 'AI_INVALID_RESPONSE');
      const reply = parsed.data.output.filter(item => item.type === 'message').flatMap(item => item.content ?? [])
        .filter(item => item.type === 'output_text').map(item => item.text ?? '').join('\n');
      if (!reply.trim()) throw new AppError('The AI provider returned no text.', 502, 'AI_EMPTY_RESPONSE');
      return { model: parsed.data.model, reply, totalTokens: parsed.data.usage?.total_tokens,
        ...(options.includeMetadata ? { responseId: parsed.data.id ?? null } : {}) };
    }
    const parsed = CompletionResponse.safeParse(await request('/chat/completions', {
      model: config.model, messages, max_tokens: maxTokens, stream: false,
      ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
      ...(options.structuredTool ? {
        tools: [{ type: 'function', function: { name: options.structuredTool.name,
          description: 'Return the complete assessment as structured data. This executes no actions.', parameters: options.structuredTool.schema } }],
        tool_choice: { type: 'function', function: { name: options.structuredTool.name } },
      } : {}),
    }));
    if (!parsed.success) throw new AppError('The AI provider returned an invalid completion.', 502, 'AI_INVALID_RESPONSE');
    const choice = parsed.data.choices[0];
    if (options.includeMetadata && choice.finish_reason && choice.finish_reason !== 'stop' && !(options.structuredTool && choice.finish_reason === 'tool_calls')) {
      throw new AppError('The AI provider returned an incomplete or refused assessment. Retry after checking its output limit.', 502, 'AI_INCOMPLETE_RESPONSE');
    }
    const calls = choice.message.tool_calls;
    if (options.structuredTool && (calls?.length !== 1 || calls[0].function.name !== options.structuredTool.name)) {
      throw new AppError('The AI provider did not return the requested structured assessment.', 502, 'AI_INVALID_RESPONSE');
    }
    const reply = options.structuredTool ? calls![0].function.arguments : choice.message.content;
    if (!reply?.trim()) throw new AppError('The AI provider returned no text.', 502, 'AI_EMPTY_RESPONSE');
    return { model: parsed.data.model, reply, totalTokens: parsed.data.usage?.total_tokens,
      ...(options.includeMetadata ? { responseId: parsed.data.id ?? null } : {}) };
  }

  return { listModels, supportedParameters, generateText };
}

export const freeLlmClient = createFreeLlmClient(resolveAiConfiguration(env));
