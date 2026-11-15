import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { buildPaginationMeta, sendSuccess } from '../utils/apiResponse';
import {
  getAiManagementSettings, getAiNotification, listAiNotifications, listDailyRankingRuns, markAiNotificationRead, markAllAiNotificationsRead,
  saveAiManagementSettings, updateAiNotification,
} from '../ai-management/store';
import { nextScheduledRun, runDailyRankingNow } from '../ai-management/scheduler';
import {
  disableCompanyManagement, enableCompanyManagement, pauseCompanyManagement, pollInbox, processCompany, resumeCompanyManagement,
  runAiManagementWorkerTick, setGlobalOutbound, simulateCustomerReply, syncCompanyInterventions, takeOverCompany,
} from '../ai-management/orchestrator';
import { aiManagementAnalytics, companyConversations, companyDetail, companyTimeline, listFollowUps, listManagedCompanies } from '../ai-management/views';
import { OUTREACH_BASES } from '../ai-management/policy';
import { MANAGEMENT_STATES, COMMUNICATION_STATES, NOTIFICATION_TYPES } from '../models/AiManagement';
import { emailProviderStatus } from '../sales/email-provider';
import { previewSeedingAllowed, seedPreviewCompanies } from '../ai-management/preview';

const router = Router();
const syntheticPreview = () => env.HOSTED_PREVIEW && env.STORAGE_MODE === 'memory' && env.LOCAL_DEMO_MODE && env.SALES_EMAIL_PROVIDER === 'mock';
router.use((req, _res, next) => {
  if (env.NODE_ENV !== 'production' || syntheticPreview()) { next(); return; }
  if (!env.SALES_API_TOKEN) { next(new AppError('AI Management is disabled until SALES_API_TOKEN is configured.', 503, 'SALES_AUTH_NOT_CONFIGURED')); return; }
  const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = Buffer.from(env.SALES_API_TOKEN), actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    next(new AppError('AI Management authentication is required.', 401, 'UNAUTHORIZED')); return;
  }
  next();
});

const actor = z.string().trim().min(1).max(120).default('local_sales_user');
const companyIdParam = (value: string) => {
  if (!/^(entity:Q[1-9]\d{0,12}|synthetic:[a-z0-9-]{1,80}|research-[0-9a-f-]{36})$/.test(value)) throw new AppError('Invalid company ID.', 400, 'VALIDATION_ERROR');
  return value;
};
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Use a valid IANA timezone.');
const settingsInput = z.object({
  version: z.number().int().nonnegative(),
  dailyRankingEnabled: z.boolean(),
  dailyTarget: z.number().int().min(1).max(200),
  preferredTime: time,
  timezone,
  minimumScore: z.number().min(0).max(100),
  minimumConfidence: z.number().min(0).max(100),
  globalOutboundEnabled: z.boolean(),
  followupIntervalsDays: z.array(z.number().int().min(1).max(180)).max(5),
  maxFollowups: z.number().int().min(0).max(5),
  noResponseCloseDays: z.number().int().min(1).max(60),
  minimumAutoConfidence: z.number().min(0.5).max(1),
  minimumOutreachConfidence: z.number().min(0.3).max(1),
  maxProactiveEmailsPer7Days: z.number().int().min(1).max(10),
  minimumHoursBetweenProactiveEmails: z.number().int().min(1).max(720),
  consentOnlyJurisdictions: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)).max(250),
  inboxPollIntervalMinutes: z.number().int().min(1).max(30),
}).strict();

async function settingsView() {
  const [settings, runs] = await Promise.all([getAiManagementSettings(), listDailyRankingRuns(1)]);
  const last = runs[0] ?? null;
  return { ...settings, nextScheduledRunAt: await nextScheduledRun(settings),
    lastRun: last ? { runId: last.runId, status: last.status, trigger: last.trigger ?? null, startedAt: last.startedAt, completedAt: last.completedAt ?? null,
      target: last.target ?? null, discovered: last.discovered, ranked: last.ranked, selected: last.selected, rejected: last.rejected, skipped: last.skipped,
      error: last.error ?? null } : null,
    lastRankingRunAt: last?.completedAt ?? null, emailProvider: emailProviderStatus(), previewSeedingAvailable: previewSeedingAllowed() };
}

router.get('/settings', async (_req, res, next) => {
  try { sendSuccess(res, await settingsView()); } catch (error) { next(error); }
});

router.put('/settings', async (req, res, next) => {
  try {
    const input = settingsInput.parse(req.body);
    if (input.maxFollowups > input.followupIntervalsDays.length) {
      throw new AppError('Provide one follow-up interval for each allowed follow-up.', 400, 'INVALID_FOLLOWUP_POLICY');
    }
    const { version, ...fields } = input;
    await saveAiManagementSettings(fields, version);
    sendSuccess(res, await settingsView());
  } catch (error) { next(error); }
});

router.get('/daily-runs', async (req, res, next) => {
  try {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(req.query);
    sendSuccess(res, await listDailyRankingRuns(query.limit));
  } catch (error) { next(error); }
});

router.post('/daily-runs/run', async (req, res, next) => {
  try {
    z.object({}).strict().parse(req.body ?? {});
    const run = await runDailyRankingNow({ forceAssessment: true });
    sendSuccess(res, run, run.status === 'COMPLETED' ? 201 : 200);
  } catch (error) { next(error); }
});

router.get('/companies', async (req, res, next) => {
  try {
    const query = z.object({
      status: z.string().trim().max(40).optional(), industry: z.string().trim().max(120).optional(), country: z.string().trim().max(120).optional(),
      priority: z.string().trim().max(60).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(),
      scope: z.enum(['all', 'managed', 'queue']).default('all'), search: z.string().trim().max(120).optional(),
    }).parse(req.query);
    if (query.status && ![...MANAGEMENT_STATES, ...COMMUNICATION_STATES, 'HUMAN_ATTENTION'].includes(query.status)) throw new AppError('Unknown status filter.', 400, 'VALIDATION_ERROR');
    sendSuccess(res, await listManagedCompanies(query));
  } catch (error) { next(error); }
});

router.get('/companies/:companyId', async (req, res, next) => {
  try { sendSuccess(res, await companyDetail(companyIdParam(req.params.companyId))); } catch (error) { next(error); }
});

const enableInput = z.object({
  actor,
  authorizationAcknowledged: z.literal(true, { error: 'Confirm that enabling AI Management authorises autonomous outreach for this company.' }),
  complianceReviewed: z.literal(true, { error: 'Confirm that the outreach basis was reviewed for the contact’s jurisdiction.' }),
  jurisdiction: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a two-letter country code.'),
  contact: z.object({
    name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254), role: z.string().trim().min(1).max(120),
    source: z.string().trim().min(3).max(300), outreachBasis: z.enum(OUTREACH_BASES),
  }).strict().optional(),
}).strict();

router.post('/companies/:companyId/enable', async (req, res, next) => {
  try {
    const input = enableInput.parse(req.body);
    sendSuccess(res, await enableCompanyManagement(companyIdParam(req.params.companyId), input), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/disable', async (req, res, next) => {
  try {
    const input = z.object({ actor }).strict().parse(req.body ?? {});
    sendSuccess(res, await disableCompanyManagement(companyIdParam(req.params.companyId), input.actor));
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/pause', async (req, res, next) => {
  try {
    const input = z.object({ actor, reason: z.string().trim().max(300).optional() }).strict().parse(req.body ?? {});
    sendSuccess(res, await pauseCompanyManagement(companyIdParam(req.params.companyId), input.actor, input.reason));
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/resume', async (req, res, next) => {
  try {
    const input = z.object({ actor }).strict().parse(req.body ?? {});
    sendSuccess(res, await resumeCompanyManagement(companyIdParam(req.params.companyId), input.actor));
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/takeover', async (req, res, next) => {
  try {
    const input = z.object({ owner: z.string().trim().min(1).max(120) }).strict().parse(req.body ?? {});
    sendSuccess(res, await takeOverCompany(companyIdParam(req.params.companyId), input.owner));
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/process', async (req, res, next) => {
  try {
    z.object({}).strict().parse(req.body ?? {});
    sendSuccess(res, await processCompany(companyIdParam(req.params.companyId)));
  } catch (error) { next(error); }
});

router.get('/companies/:companyId/conversations', async (req, res, next) => {
  try { sendSuccess(res, await companyConversations(companyIdParam(req.params.companyId))); } catch (error) { next(error); }
});

router.get('/companies/:companyId/timeline', async (req, res, next) => {
  try { sendSuccess(res, await companyTimeline(companyIdParam(req.params.companyId))); } catch (error) { next(error); }
});

router.post('/companies/:companyId/simulate-reply', async (req, res, next) => {
  try {
    if (env.NODE_ENV === 'production' && !syntheticPreview()) throw new AppError('Reply simulation is only available in local or synthetic preview mode.', 403, 'DEMO_ONLY');
    const input = z.object({ text: z.string().trim().min(1).max(5000) }).strict().parse(req.body);
    sendSuccess(res, await simulateCustomerReply(companyIdParam(req.params.companyId), input.text), 201);
  } catch (error) { next(error); }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const bool = z.enum(['true', 'false']).transform(value => value === 'true').optional();
    const query = z.object({ unread: bool, requiresAction: bool, priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
      type: z.enum(NOTIFICATION_TYPES).optional(), status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'UNRESOLVED']).optional(),
      companyId: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(25) }).parse(req.query);
    const result = await listAiNotifications(query);
    res.status(200).json({ success: true, data: result.data, meta: { ...buildPaginationMeta(query.page, query.limit, result.total),
      unreadCount: result.unreadCount, openActionCount: result.openActionCount } });
  } catch (error) { next(error); }
});

router.post('/notifications/read-all', async (_req, res, next) => {
  try { await markAllAiNotificationsRead(); sendSuccess(res, { ok: true }); } catch (error) { next(error); }
});

router.post('/notifications/:id/read', async (req, res, next) => {
  try { sendSuccess(res, await markAiNotificationRead(req.params.id)); } catch (error) { next(error); }
});

router.post('/notifications/:id/acknowledge', async (req, res, next) => {
  try {
    const input = z.object({ owner: z.string().trim().min(1).max(120) }).strict().parse(req.body);
    sendSuccess(res, await updateAiNotification(req.params.id, { status: 'ACKNOWLEDGED', owner: input.owner, unread: false }));
  } catch (error) { next(error); }
});

router.post('/notifications/:id/resolve', async (req, res, next) => {
  try {
    const input = z.object({ actor, resolution: z.string().trim().max(500).optional(), resumeAi: z.boolean().default(false) }).strict().parse(req.body ?? {});
    const existing = await getAiNotification(req.params.id);
    if (!existing) throw new AppError('Notification was not found.', 404, 'AI_NOTIFICATION_NOT_FOUND');
    const resolved = await updateAiNotification(req.params.id, { status: 'RESOLVED', unread: false, resolvedAt: new Date(), resolvedBy: input.actor,
      resolution: input.resolution || 'Resolved by salesperson.' });
    const company = input.resumeAi && existing.companyId !== 'global' ? await resumeCompanyManagement(existing.companyId, input.actor) : null;
    // A resolved AI notification also closes the matching Sales intervention (same customer reply).
    if (!company && existing.companyId !== 'global' && existing.requiresAction) {
      const remaining = await listAiNotifications({ companyId: existing.companyId, requiresAction: true, status: 'UNRESOLVED', page: 1, limit: 1 });
      if (remaining.total === 0) await syncCompanyInterventions(existing.companyId, 'RESOLVED', input.actor);
    }
    sendSuccess(res, { notification: resolved, company });
  } catch (error) { next(error); }
});

router.get('/follow-ups', async (_req, res, next) => {
  try { sendSuccess(res, await listFollowUps()); } catch (error) { next(error); }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const query = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }).parse(req.query);
    sendSuccess(res, await aiManagementAnalytics(query));
  } catch (error) { next(error); }
});

router.post('/emergency-stop', async (req, res, next) => {
  try {
    const input = z.object({ actor, reason: z.string().trim().max(300).optional() }).strict().parse(req.body ?? {});
    sendSuccess(res, await setGlobalOutbound(false, input.actor, input.reason));
  } catch (error) { next(error); }
});

router.post('/emergency-resume', async (req, res, next) => {
  try {
    const input = z.object({ actor }).strict().parse(req.body ?? {});
    sendSuccess(res, await setGlobalOutbound(true, input.actor));
  } catch (error) { next(error); }
});

router.post('/demo/seed', async (_req, res, next) => {
  try { sendSuccess(res, await seedPreviewCompanies(), 201); } catch (error) { next(error); }
});

router.post('/inbox/poll', async (_req, res, next) => {
  try { sendSuccess(res, await pollInbox(new Date(), true)); } catch (error) { next(error); }
});

router.post('/worker/run', async (_req, res, next) => {
  try { sendSuccess(res, await runAiManagementWorkerTick(new Date(), { forcePoll: true })); } catch (error) { next(error); }
});

export default router;
