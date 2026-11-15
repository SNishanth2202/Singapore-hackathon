import { randomBytes, createHash } from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { DEFAULT_RANKING_MODEL, OpenAiCredential, validateOpenAiKey } from './openai-ranking';
import { publicAiConfigurationProblems, resolveAiConfiguration } from '../config/ai';

const COOKIE = 'singtel_ranking_session';
const TTL = 8 * 60 * 60 * 1000;
export const KeyInputSchema = z.object({ apiKey: z.string().trim().min(20).max(400).regex(/^sk-[A-Za-z0-9_-]+$/) }).strict();

export function sharedRankingCredential(environment: NodeJS.ProcessEnv): OpenAiCredential | null {
  const generic = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_PROTOCOL', 'AI_MODELS_URL'].some(key => !!environment[key]?.trim());
  if (!generic) return null;
  const protocol = environment.AI_PROTOCOL?.trim();
  if (protocol && !['chat_completions', 'responses'].includes(protocol)) return null;
  const effort = environment.AI_REASONING_EFFORT?.trim();
  if (effort && !['none', 'low', 'medium', 'high'].includes(effort)) return null;
  const config = resolveAiConfiguration({
    AI_BASE_URL: environment.AI_BASE_URL, AI_API_KEY: environment.AI_API_KEY, AI_MODEL: environment.AI_MODEL,
    AI_PROTOCOL: protocol as 'chat_completions' | 'responses' | undefined, AI_MODELS_URL: environment.AI_MODELS_URL,
    AI_TIMEOUT_MS: Math.min(120000, Math.max(1000, Number(environment.AI_TIMEOUT_MS) || 90000)),
    AI_REASONING_EFFORT: effort as 'none' | 'low' | 'medium' | 'high' | undefined,
    FREELLMAPI_BASE_URL: '', FREELLMAPI_API_KEY: '', FREELLMAPI_MODEL: '', FREELLMAPI_TIMEOUT_MS: 90000,
  });
  if (publicAiConfigurationProblems(config).length) return null;
  const host = new URL(config.baseUrl).hostname;
  const provider = host === 'openrouter.ai' ? 'OpenRouter' : host === 'api.openai.com' ? 'OpenAI' : 'Configured AI';
  const { apiKey, model, ...providerConfig } = config;
  return { apiKey, model, provider, providerConfig, source: 'environment',
    namespace: `environment-${createHash('sha256').update(JSON.stringify({ apiKey, model, ...providerConfig })).digest('hex').slice(0, 24)}` };
}

/** Browser-provided keys live only in backend memory. The cookie holds an opaque session ID. */
export class RankingKeySessions {
  private sessions = new Map<string, { credential: OpenAiCredential; expiresAt: number }>();
  constructor(private validate = validateOpenAiKey, private environment: NodeJS.ProcessEnv = process.env) {}
  private sessionId(req: Request) {
    return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  }
  resolve(req: Request): OpenAiCredential | null {
    const now = Date.now();
    for (const [id, entry] of this.sessions) if (entry.expiresAt <= now) this.sessions.delete(id);
    const id = this.sessionId(req), session = id ? this.sessions.get(id) : undefined;
    if (session) { session.expiresAt = now + TTL; return session.credential; }
    // Use the same explicit provider namespace as company research. Never send an
    // OpenRouter key to the legacy fixed OpenAI endpoint or silently borrow a key.
    const generic = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_PROTOCOL', 'AI_MODELS_URL'].some(key => !!this.environment[key]?.trim());
    if (generic) return sharedRankingCredential(this.environment);
    const key = this.environment.OPENAI_API_KEY?.trim();
    if (!key) return null;
    return { apiKey: key, model: this.environment.OPENAI_MODEL?.trim() || DEFAULT_RANKING_MODEL,
      namespace: `environment-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`, source: 'environment' };
  }
  status(req: Request) {
    const credential = this.resolve(req);
    return { configured: !!credential, source: credential?.source || null,
      provider: credential?.provider || 'OpenAI',
      model: credential?.model || this.environment.OPENAI_MODEL?.trim() || DEFAULT_RANKING_MODEL };
  }
  async connect(req: Request, res: Response) {
    const { apiKey } = KeyInputSchema.parse(req.body);
    const model = this.environment.OPENAI_MODEL?.trim() || DEFAULT_RANKING_MODEL;
    await this.validate(apiKey, model);
    if (this.sessions.size >= 100) throw new AppError('Too many active key sessions. Try again later.', 503, 'KEY_SESSION_LIMIT');
    const old = this.sessionId(req); if (old) this.sessions.delete(old);
    const id = randomBytes(32).toString('hex');
    this.sessions.set(id, { credential: { apiKey, model, namespace: `session-${id}`, source: 'session' }, expiresAt: Date.now() + TTL });
    res.cookie(COOKIE, id, { httpOnly: true, secure: req.secure, sameSite: req.secure ? 'none' : 'lax',
      path: '/api/v1/ranking', maxAge: TTL });
    return { configured: true, source: 'session' as const, model };
  }
  disconnect(req: Request, res: Response) {
    const id = this.sessionId(req); if (id) this.sessions.delete(id);
    res.clearCookie(COOKIE, { path: '/api/v1/ranking', httpOnly: true, secure: req.secure, sameSite: req.secure ? 'none' : 'lax' });
    return { disconnected: true };
  }
}
