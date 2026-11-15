import { createHash } from 'node:crypto';
import { RankingService } from './service';
import { LlmQueueService } from './llm-queue';
import { DEFAULT_RANKING_MODEL, OpenAiCredential } from './openai-ranking';
import { QueueSnapshot } from './contracts';

export const rankingService = new RankingService();
export const rankingLlmQueue = new LlmQueueService(
  rankingService,
  undefined,
  process.env.LEAD_RANKING_CACHE_PATH || undefined,
);
export const configuredRankingMode = process.env.LEAD_RANKING_MODE === 'rules' ? 'rules' : 'llm';

export function getEnvironmentRankingCredential(): OpenAiCredential | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_RANKING_MODEL,
    namespace: 'environment-' + createHash('sha256').update(apiKey).digest('hex').slice(0, 24),
    source: 'environment',
  };
}

export function getScheduledRankingSnapshot(force = false): Promise<QueueSnapshot> {
  if (configuredRankingMode === 'rules') return Promise.resolve(rankingService.get('crm_plus_public'));
  return rankingLlmQueue.get('crm_plus_public', getEnvironmentRankingCredential(), force);
}
