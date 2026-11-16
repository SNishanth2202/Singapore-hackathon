import fs from 'node:fs/promises';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { ResearchRecord, saveResearch, validResearchId } from '../integrations/research/store';
import { SavedAnalysis, restoreMemoryAnalysis, validAnalysisId } from '../integrations/research/analysisStore';
import { allActivityEvents, appendActivity, clearMemoryActivities } from '../salesStore';
import { SalesActivity, ISalesActivity } from '../models/SalesActivity';
import { AiManagementCompany, AiManagementNotification, AiManagementSettings, DailyRankingRun,
  AiManagementCompanyRecord, AiManagementNotificationRecord, DailyRankingRunRecord } from '../models/AiManagement';
import { createAiNotification, findCompanyManagement, getAiManagementSettings, saveAiManagementSettings, patchOperationalSettings,
  saveCompanyManagement, saveDailyRankingRun, updateAiNotification } from '../ai-management/store';
import { businessKnowledgeStore } from '../business/store';
import { KnowledgeSchema } from '../business/schema';
import { SettingsSchema as ProspectingSettingsSchema, initialState, State } from '../prospecting/contracts';
import { jobStore } from '../prospecting/store';

const BackupEnvelope = z.object({
  format: z.literal('singtel-scout-local-session-v1'), capturedAt: z.string(), source: z.string(),
  research: z.array(z.unknown()).max(100), analyses: z.array(z.unknown()).max(1000), events: z.array(z.unknown()).max(50000),
  management: z.array(z.unknown()).max(1000), notifications: z.array(z.unknown()).max(10000), dailyRuns: z.array(z.unknown()).max(100),
  settings: z.unknown(), businessKnowledge: z.unknown().optional(), prospecting: z.unknown().optional(), limitations: z.array(z.string()),
});
export type ShowcaseSessionBackup = z.infer<typeof BackupEnvelope>;
const invalid = (message: string): never => { throw new AppError(message, 400, 'INVALID_SESSION_BACKUP'); };
function date(value: unknown, field: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) invalid('Invalid ' + field + ' in the session backup.');
  const parsed = new Date(value as string);
  if (!Number.isFinite(+parsed)) invalid('Invalid ' + field + ' in the session backup.');
  return parsed;
}
function plain<T>(Model: any, value: unknown): T {
  const document = new Model(value);
  if (document.validateSync()) invalid('A ' + Model.modelName + ' record in the session backup is invalid.');
  const { _id: _ignored, __v: _version, ...result } = document.toObject();
  return result as T;
}
function researchRecord(value: unknown): ResearchRecord {
  if (!value || typeof value !== 'object') invalid('Invalid research record.');
  const row = value as ResearchRecord;
  if (!validResearchId(row.id) || !row.company || typeof row.company.entityId !== 'string' || typeof row.company.name !== 'string'
    || !row.company.name.trim() || !Array.isArray(row.sources) || !Array.isArray(row.warnings)) invalid('Invalid research record.');
  date(row.createdAt, 'research creation date');
  for (const source of row.sources) {
    if (!source || typeof source.id !== 'string' || typeof source.title !== 'string' || typeof source.url !== 'string'
      || typeof source.excerpt !== 'string' || typeof source.contentHash !== 'string'
      || !['company_profile', 'official_page', 'news_headline'].includes(source.kind)
      || !['retrieved_profile', 'retrieved_official_page', 'headline_only'].includes(source.verification)) invalid('Invalid research source.');
    date(source.retrievedAt, 'source retrieval date');
    if (source.publishedAt !== null) date(source.publishedAt, 'source publication date');
  }
  return structuredClone(row);
}

const LeadSnapshot = z.object({
  id: z.string().min(1), name: z.string().min(1), description: z.string(), website: z.string().nullable(),
  researchId: z.string().refine(validResearchId), score: z.number().min(0).max(100), whyNow: z.string(),
  analysis: z.unknown(), sources: z.array(z.object({
    id: z.string(), kind: z.enum(['company_profile', 'official_page', 'news_headline']), title: z.string(), url: z.string(),
    publisher: z.string(), excerpt: z.string(), contentHash: z.string(), retrievedAt: z.string().refine(value => Number.isFinite(Date.parse(value))),
    publishedAt: z.string().refine(value => Number.isFinite(Date.parse(value))).nullable(),
    verification: z.enum(['retrieved_profile', 'retrieved_official_page', 'headline_only']),
  }).passthrough()), researchedAt: z.string().refine(value => Number.isFinite(Date.parse(value))),
  relationship: z.literal('UNKNOWN'), model: z.string().nullable(),
}).passthrough();
const ResearchHistory = z.object({
  id: z.string(), status: z.enum(['discovering', 'researching', 'completed', 'failed']),
  startedAt: z.string().refine(value => Number.isFinite(Date.parse(value))),
  settings: ProspectingSettingsSchema, cursor: z.number().int().nonnegative(), failures: z.array(z.string()),
  sourceReports: z.array(z.object({ source: z.string(), count: z.number().int().nonnegative(), status: z.string() })),
}).passthrough();

/** Validate the complete backup before restoring it. No AI, provider call, or cloud write is permitted. */
export async function restoreShowcaseSession(value: unknown) {
  if (env.STORAGE_MODE !== 'memory') throw new AppError('Local sessions can only be restored into memory storage.', 409, 'MEMORY_RESTORE_ONLY');
  const backup = BackupEnvelope.parse(value);
  date(backup.capturedAt, 'capture date');
  const research = backup.research.map(researchRecord);
  const analyses = backup.analyses.map(value => {
    const row = value as SavedAnalysis;
    if (!row || !validAnalysisId(row.id) || typeof row.companyId !== 'string' || !row.companyId.trim()
      || row.companyId.length > 100 || !row.result || typeof row.result !== 'object' || Array.isArray(row.result)
      || (row.result.analysisId !== undefined && row.result.analysisId !== row.id)) invalid('Invalid saved analysis.');
    date(row.createdAt, 'analysis creation date'); return structuredClone(row);
  });
  const events = backup.events.map(value => plain<ISalesActivity>(SalesActivity, value));
  const management = backup.management.map(value => plain<AiManagementCompanyRecord>(AiManagementCompany, value));
  const notifications = backup.notifications.map(value => plain<AiManagementNotificationRecord>(AiManagementNotification, value));
  const runs = backup.dailyRuns.map(value => plain<DailyRankingRunRecord>(DailyRankingRun, value));
  const settings = plain<any>(AiManagementSettings, backup.settings);
  const knowledge = backup.businessKnowledge ? KnowledgeSchema.parse(backup.businessKnowledge) : null;
  const prospecting = backup.prospecting as any;
  const prospectingSettings = prospecting?.settings ? ProspectingSettingsSchema.parse(prospecting.settings) : null;
  const nextResearchAt = prospecting?.nextRunAt ? date(prospecting.nextRunAt, 'next research date').toISOString() : null;
  const leads = prospectingSettings ? z.array(LeadSnapshot).max(100).parse(prospecting.leads ?? []) : [];
  const history = prospectingSettings ? z.array(ResearchHistory).max(1000).parse(prospecting.history ?? []) : [];
  // Keep old event content when a freshly regenerated scenario reuses its stable event ID.
  const merged = new Map((await allActivityEvents()).map(event => [event.eventId, event]));
  for (const event of events) merged.set(event.eventId, event);
  clearMemoryActivities();
  for (const event of [...merged.values()].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))) await appendActivity(event);
  for (const row of research.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) await saveResearch(row);
  for (const row of analyses.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) restoreMemoryAnalysis(row);
  for (const row of management) {
    const current = await findCompanyManagement(row.companyId);
    await saveCompanyManagement({ ...row, version: current?.version ?? 0 });
  }
  for (const row of notifications) {
    await createAiNotification(row);
    await updateAiNotification(row.notificationId, { unread: row.unread, status: row.status, owner: row.owner,
      resolvedAt: row.resolvedAt, resolvedBy: row.resolvedBy, resolution: row.resolution });
  }
  for (const run of runs) await saveDailyRankingRun(run);
  const currentSettings = await getAiManagementSettings();
  const { settingsKey: _key, version: _version, lastEmailPollAt: _cursor, outboundStoppedAt: _stop, outboundStopReason: _reason, ...editable } = settings;
  await saveAiManagementSettings(editable, currentSettings.version);
  await patchOperationalSettings({ lastEmailPollAt: settings.lastEmailPollAt ?? null,
    outboundStoppedAt: settings.outboundStoppedAt ?? null, outboundStopReason: settings.outboundStopReason ?? null });
  if (knowledge) await businessKnowledgeStore.initialize(knowledge);
  if (prospectingSettings) {
    const next: State = { ...initialState(), settings: prospectingSettings,
      leads, history, nextRunAt: nextResearchAt };
    const token = await jobStore.claim();
    if (!token) throw new Error('Could not acquire the local research store for session restoration.');
    try { if (!await jobStore.write(next, token)) throw new Error('Local research state changed during restoration.'); }
    finally { await jobStore.release(token); }
  }
  return { restoredResearch: research.length, restoredAnalyses: analyses.length, restoredEvents: events.length,
    restoredManagement: management.length, restoredNotifications: notifications.length, restoredDailyRuns: runs.length,
    totalSalesEvents: merged.size, limitations: backup.limitations };
}

export async function restoreShowcaseSessionFile(file: string) {
  const stat = await fs.stat(file);
  if (stat.size > 50 * 1024 * 1024) invalid('Session backup exceeds the 50 MB limit.');
  return restoreShowcaseSession(JSON.parse(await fs.readFile(file, 'utf8')));
}
