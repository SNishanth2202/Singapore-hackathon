import { randomUUID } from 'node:crypto';
import { ResearchSnapshot } from '../../models/CloudStorage';
import { projectResearch } from './researchGraph';
import type { ResearchRecord } from '../research/store';
import { logger } from '../../utils/logger';

export function retryDelay(attempts: number): number { return Math.min(300000, 5000 * 2 ** Math.min(6, Math.max(0, attempts - 1))); }

export async function syncNextResearch(): Promise<boolean> {
  const now = new Date(), token = randomUUID();
  const job = await ResearchSnapshot.findOneAndUpdate({ $or: [
    { graphStatus: 'PENDING', graphRetryAt: { $lte: now } },
    { graphStatus: 'PROCESSING', graphLeaseUntil: { $lte: now } },
  ] }, { $set: { graphStatus: 'PROCESSING', graphLeaseToken: token, graphLeaseUntil: new Date(now.getTime() + 120000) },
    $inc: { graphAttempts: 1 } }, { new: true, sort: { createdAt: 1 } }).lean();
  if (!job) return false;
  try {
    await projectResearch(job.record as ResearchRecord);
    await ResearchSnapshot.updateOne({ _id: job._id, graphLeaseToken: token }, {
      $set: { graphStatus: 'SYNCED', graphSyncedAt: new Date(), graphLeaseUntil: new Date(0) }, $unset: { graphLeaseToken: 1 },
    });
  } catch {
    await ResearchSnapshot.updateOne({ _id: job._id, graphLeaseToken: token }, {
      $set: { graphStatus: 'PENDING', graphRetryAt: new Date(Date.now() + retryDelay(job.graphAttempts)), graphLeaseUntil: new Date(0) },
      $unset: { graphLeaseToken: 1 },
    });
    logger.warn('Research remains saved in Atlas; graph projection will retry', { researchId: job._id });
  }
  return true;
}

export function startGraphSyncWorker(): () => Promise<void> {
  let stopped = false, running: Promise<void> | undefined, timer: NodeJS.Timeout | undefined;
  const tick = () => {
    running = (async () => {
      try { for (let i = 0; i < 5 && !stopped; i++) if (!await syncNextResearch()) break; }
      catch { logger.warn('Graph sync paused; the next poll will retry'); }
      finally { if (!stopped) { timer = setTimeout(tick, 5000); timer.unref(); } }
    })();
  };
  tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
