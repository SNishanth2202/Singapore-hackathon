import { randomBytes, createHash } from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { DEFAULT_RANKING_MODEL, OpenAiCredential, validateOpenAiKey } from './openai-ranking';

const COOKIE = 'singtel_ranking_session';
const TTL = 8 * 60 * 60 * 1000;
export const KeyInputSchema = z.object({ apiKey: z.string().trim().min(20).max(400).regex(/^sk-[A-Za-z0-9_-]+$/) }).strict();

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
    const key = this.environment.OPENAI_API_KEY?.trim();
    if (!key) return null;
    return { apiKey: key, model: this.environment.OPENAI_MODEL?.trim() || DEFAULT_RANKING_MODEL,
      namespace: `environment-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`, source: 'environment' };
  }
  status(req: Request) {
    const credential = this.resolve(req);
    return { configured: !!credential, source: credential?.source || null,
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
