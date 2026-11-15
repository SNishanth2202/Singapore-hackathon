import { randomUUID } from 'node:crypto';
import { QueueRow } from '../ranking/contracts';
import { getScheduledRankingSnapshot } from '../ranking/runtime';
import { AppError } from '../utils/errors';
import { findCompanyActivities } from '../salesStore';
import {
  acquireAiManagementLease, getAiManagementSettings, getDailyRankingRun, listCompanyManagement, listDailyRankingRuns,
  previouslyQueuedCompanyIds, releaseAiManagementLease, saveDailyRankingRun,
} from './store';
import { AiManagementSettingsRecord, DailyRankingRunRecord, SelectedLead } from '../models/AiManagement';

function zonedParts(date: Date, timezone: string) {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(part => [part.type, part.value])) as Record<string, string>;
  } catch {
    throw new AppError('The configured ranking timezone is not supported.', 400, 'INVALID_TIMEZONE');
  }
}

export function localClock(date: Date, timezone: string) {
  const parts = zonedParts(date, timezone);
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}

/** Convert a wall-clock time in an IANA timezone to a UTC instant (DST-safe to within one correction step). */
export function zonedTimeToUtc(localDate: string, time: string, timezone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const parts = zonedParts(new Date(guess), timezone);
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    guess += target - asUtc;
  }
  return new Date(guess);
}

export async function nextScheduledRun(settings: AiManagementSettingsRecord, now = new Date()): Promise<Date | null> {
  if (!settings.dailyRankingEnabled) return null;
  const today = localClock(now, settings.timezone).date;
  const todayRun = await getDailyRankingRun('daily-ranking:' + today);
  const todayAt = zonedTimeToUtc(today, settings.preferredTime, settings.timezone);
  if (!todayRun && +todayAt > +now) return todayAt;
  if (!todayRun || todayRun.status === 'FAILED') return now; // due now; the worker checks every minute
  const tomorrow = localClock(new Date(+todayAt + 36 * 3600_000), settings.timezone).date;
  return zonedTimeToUtc(tomorrow, settings.preferredTime, settings.timezone);
}

function discoveryEntity(row: QueueRow): { companyId: string; companyName: string } | null {
  if (!row.id.startsWith('DISC-') || !row.accountId.startsWith('DISC-')) return null;
  const entityId = row.accountId.slice('DISC-'.length);
  if (!/^Q[1-9][0-9]{0,12}$/.test(entityId)) return null;
  return { companyId: 'entity:' + entityId, companyName: row.account };
}

function eligible(row: QueueRow, minimumScore: number, minimumConfidence: number) {
  const confidence = row.rankingConfidence.score;
  return (row.status === 'Pursue' || row.status === 'Verify')
    && row.score >= minimumScore
    && confidence !== null
    && confidence >= minimumConfidence;
}

async function leadDetails(companyId: string) {
  const events = await findCompanyActivities(companyId);
  const discovered = events.find(event => event.type === 'DISCOVERED');
  return { country: discovered?.country ?? null, industry: discovered?.industry ?? null };
}

/**
 * Prepare the daily queue from the existing Lead Ranking snapshot. The target is a maximum: the queue never
 * contains a company that failed the ranking thresholds, was queued on an earlier day, or is already AI-managed.
 */
export async function runDailyRankingNow(options: { forceAssessment?: boolean; scheduled?: boolean; now?: Date } = {}) {
  const settings = await getAiManagementSettings();
  const now = options.now ?? new Date();
  const date = localClock(now, settings.timezone).date;
  const runId = options.scheduled ? 'daily-ranking:' + date : 'daily-ranking:manual:' + date + ':' + randomUUID();
  const leaseKey = options.scheduled ? 'daily-ranking:' + date : 'daily-ranking:manual:' + date;
  const leaseOwner = await acquireAiManagementLease(leaseKey, 10 * 60_000);
  if (!leaseOwner) return { status: 'skipped' as const, reason: 'Another ranking worker owns this run.' };
  try {
    const previousRun = await getDailyRankingRun(runId);
    if (previousRun && previousRun.status === 'COMPLETED') return previousRun;
    const running: DailyRankingRunRecord = {
      runId, localDate: date, status: 'RUNNING', trigger: options.scheduled ? 'SCHEDULED' : 'MANUAL', startedAt: now, target: settings.dailyTarget,
      discovered: 0, ranked: 0, selected: 0, rejected: 0, skipped: 0, companyIds: [], selectedLeads: [],
    };
    await saveDailyRankingRun(running);
    try {
      const snapshot = await getScheduledRankingSnapshot(options.forceAssessment);
      if (snapshot.llm && snapshot.llm.status !== 'ready' && snapshot.llm.mode === 'llm') {
        throw new AppError(snapshot.llm.error || 'Server-side ranking credentials are required for a scheduled run.',
          503, 'RANKING_CREDENTIAL_REQUIRED');
      }
      const seen = await previouslyQueuedCompanyIds();
      const managed = new Set((await listCompanyManagement()).filter(row => row.managementState !== 'OFF').map(row => row.companyId));
      const entityByCompany = new Map<string, { companyId: string; companyName: string; row: QueueRow }>();
      for (const row of snapshot.items) {
        const entity = discoveryEntity(row);
        if (!entity) continue; // seeded/synthetic CRM rows are not real companies and are never AI-managed
        const current = entityByCompany.get(entity.companyId);
        if (!current || row.rank < current.row.rank) entityByCompany.set(entity.companyId, { ...entity, row });
      }
      const candidates = [...entityByCompany.values()].sort((a, b) => a.row.rank - b.row.rank);
      const fresh = candidates.filter(item => !seen.has(item.companyId) && !managed.has(item.companyId));
      const qualified = fresh.filter(item => eligible(item.row, settings.minimumScore, settings.minimumConfidence));
      const selected = qualified.slice(0, settings.dailyTarget);
      const selectedLeads: SelectedLead[] = [];
      for (const item of selected) {
        selectedLeads.push({
          companyId: item.companyId, companyName: item.companyName, opportunityId: item.row.id,
          rank: item.row.rank, score: item.row.score, confidence: item.row.rankingConfidence.score,
          status: item.row.status, priority: item.row.priorityStatus, product: item.row.product,
          nextAction: item.row.nextAction, summary: item.row.assessment?.reason ?? item.row.useCase ?? null,
          sourceIds: item.row.evidence.filter(evidence => evidence.origin === 'public').map(evidence => evidence.id),
          ...await leadDetails(item.companyId),
        });
      }
      const completed: DailyRankingRunRecord = {
        ...running, status: 'COMPLETED', completedAt: new Date(), discovered: candidates.length,
        ranked: candidates.length, selected: selected.length, rejected: fresh.length - qualified.length,
        skipped: candidates.length - fresh.length, queueVersion: snapshot.queueVersion,
        companyIds: selected.map(item => item.companyId), selectedLeads,
      };
      return await saveDailyRankingRun(completed);
    } catch (error) {
      const failed = await saveDailyRankingRun({ ...running, status: 'FAILED', completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Ranking failed.' });
      throw Object.assign(error instanceof Error ? error : new Error('Ranking failed.'), { run: failed });
    }
  } finally {
    await releaseAiManagementLease(leaseKey, leaseOwner);
  }
}

export async function runDailyRankingSchedulerTick(now = new Date()) {
  const settings = await getAiManagementSettings();
  if (!settings.dailyRankingEnabled) return null;
  const clock = localClock(now, settings.timezone);
  if (clock.time < settings.preferredTime) return null;
  const current = await getDailyRankingRun('daily-ranking:' + clock.date);
  if (current && current.status !== 'FAILED'
    && (current.status !== 'RUNNING' || +new Date(current.startedAt) > +now - 10 * 60_000)) return null;
  return runDailyRankingNow({ scheduled: true, forceAssessment: true, now });
}

/** Latest completed queue, newest first; used for the AI-management company list. */
export async function latestSelectedLeads(limitRuns = 30) {
  const runs = (await listDailyRankingRuns(limitRuns)).filter(run => run.status === 'COMPLETED');
  const byCompany = new Map<string, SelectedLead & { runId: string; localDate: string }>();
  for (const run of runs) for (const lead of run.selectedLeads ?? []) {
    if (!byCompany.has(lead.companyId)) byCompany.set(lead.companyId, { ...lead, runId: run.runId, localDate: run.localDate });
  }
  return [...byCompany.values()];
}
