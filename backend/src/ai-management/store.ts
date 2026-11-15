import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { requireCloudMongo } from '../models/CloudStorage';
import { AppError } from '../utils/errors';
import {
  AiManagementCompany, AiManagementLease, AiManagementNotification, AiManagementSettings, DailyRankingRun,
  AiManagementCompanyRecord, AiManagementSettingsRecord, AiManagementNotificationRecord, DailyRankingRunRecord, CompanyMemory,
} from '../models/AiManagement';

export const DEFAULT_AI_MANAGEMENT_SETTINGS: AiManagementSettingsRecord = {
  settingsKey: 'global', version: 0, dailyRankingEnabled: false, dailyTarget: 20, preferredTime: '09:00',
  timezone: 'Asia/Singapore', minimumScore: 50, minimumConfidence: 60, globalOutboundEnabled: true,
  followupIntervalsDays: [4, 7], maxFollowups: 2, noResponseCloseDays: 7, minimumAutoConfidence: 0.72, minimumOutreachConfidence: 0.5,
  maxProactiveEmailsPer7Days: 2, minimumHoursBetweenProactiveEmails: 48, consentOnlyJurisdictions: [],
  inboxPollIntervalMinutes: 2, lastEmailPollAt: null, outboundStoppedAt: null, outboundStopReason: null,
};
export type EditableSettings = Omit<AiManagementSettingsRecord, 'settingsKey' | 'version' | 'lastEmailPollAt' | 'outboundStoppedAt' | 'outboundStopReason'>;

const memoryCompanies = new Map<string, AiManagementCompanyRecord>();
const memoryNotifications = new Map<string, AiManagementNotificationRecord>();
const memoryRuns = new Map<string, DailyRankingRunRecord>();
const memoryLeases = new Map<string, { ownerId: string; leaseUntil: Date }>();
let memorySettings: AiManagementSettingsRecord = structuredClone(DEFAULT_AI_MANAGEMENT_SETTINGS);

function cloud() { requireCloudMongo(); }
function toPlain<T>(value: unknown): T {
  const { _id: _ignored, __v: _version, ...rest } = structuredClone(value) as Record<string, unknown>;
  return rest as T;
}
function duplicate(error: unknown) { return (error as { code?: number })?.code === 11000; }

export function emptyMemory(): CompanyMemory {
  return { summary: '', requirements: [], preferences: [], questions: [], answers: [], objections: [], existingProviders: [],
    buyingSignals: [], promises: [], pendingActions: [] };
}

export async function getAiManagementSettings(): Promise<AiManagementSettingsRecord> {
  if (env.STORAGE_MODE === 'memory') return { ...structuredClone(DEFAULT_AI_MANAGEMENT_SETTINGS), ...structuredClone(memorySettings) };
  cloud();
  try {
    await AiManagementSettings.updateOne({ settingsKey: 'global' }, { $setOnInsert: structuredClone(DEFAULT_AI_MANAGEMENT_SETTINGS) }, { upsert: true });
  } catch (error) { if (!duplicate(error)) throw error; }
  const saved = await AiManagementSettings.findOne({ settingsKey: 'global' }).lean();
  // Fields added after a settings document was first created fall back to their defaults.
  return { ...structuredClone(DEFAULT_AI_MANAGEMENT_SETTINGS), ...(saved ? toPlain<AiManagementSettingsRecord>(saved) : {}) };
}

export async function saveAiManagementSettings(input: EditableSettings, expectedVersion: number) {
  if (env.STORAGE_MODE === 'memory') {
    if (memorySettings.version !== expectedVersion) throw new AppError('Settings changed in another session. Refresh and retry.', 409, 'AI_SETTINGS_CONFLICT');
    memorySettings = { ...memorySettings, ...structuredClone(input), settingsKey: 'global', version: expectedVersion + 1 };
    return getAiManagementSettings();
  }
  await getAiManagementSettings();
  const saved = await AiManagementSettings.findOneAndUpdate(
    { settingsKey: 'global', version: expectedVersion }, { $set: { ...input, version: expectedVersion + 1 } }, { new: true },
  ).lean();
  if (!saved) throw new AppError('Settings changed in another session. Refresh and retry.', 409, 'AI_SETTINGS_CONFLICT');
  return getAiManagementSettings();
}

/** Operational fields (inbox cursor, emergency switch) change without bumping the user-editable settings version. */
export async function patchOperationalSettings(fields: Partial<Pick<AiManagementSettingsRecord,
  'lastEmailPollAt' | 'globalOutboundEnabled' | 'outboundStoppedAt' | 'outboundStopReason'>>) {
  if (env.STORAGE_MODE === 'memory') { memorySettings = { ...memorySettings, ...structuredClone(fields) }; return getAiManagementSettings(); }
  await getAiManagementSettings();
  await AiManagementSettings.updateOne({ settingsKey: 'global' }, { $set: fields });
  return getAiManagementSettings();
}

export function defaultCompanyManagement(companyId: string, companyName: string): AiManagementCompanyRecord {
  return { companyId, companyName, managementState: 'OFF', communicationState: 'READY', followupAttempts: 0, version: 0,
    scoreHistory: [], history: [], memory: emptyMemory() };
}

function normalizeCompany(record: AiManagementCompanyRecord): AiManagementCompanyRecord {
  return { ...record, scoreHistory: record.scoreHistory ?? [], history: record.history ?? [], memory: { ...emptyMemory(), ...(record.memory ?? {}) } };
}

export async function findCompanyManagement(companyId: string): Promise<AiManagementCompanyRecord | null> {
  if (env.STORAGE_MODE === 'memory') { const value = memoryCompanies.get(companyId); return value ? normalizeCompany(structuredClone(value)) : null; }
  cloud();
  const saved = await AiManagementCompany.findOne({ companyId }).lean();
  return saved ? normalizeCompany(toPlain<AiManagementCompanyRecord>(saved)) : null;
}

export async function getCompanyManagement(companyId: string, companyName = companyId): Promise<AiManagementCompanyRecord> {
  return await findCompanyManagement(companyId) ?? defaultCompanyManagement(companyId, companyName);
}

/** Optimistic-concurrency save: fails with 409 when another worker changed the record since it was read. */
export async function saveCompanyManagement(input: AiManagementCompanyRecord) {
  const history = (input.history ?? []).slice(-200);
  const value = { ...input, history };
  if (env.STORAGE_MODE === 'memory') {
    const current = memoryCompanies.get(input.companyId) ?? defaultCompanyManagement(input.companyId, input.companyName);
    if (current.version !== input.version) throw new AppError('Company management changed in another worker. Refresh and retry.', 409, 'AI_MANAGEMENT_CONFLICT');
    const next = { ...structuredClone(value), version: current.version + 1, createdAt: current.createdAt ?? new Date(), updatedAt: new Date() };
    memoryCompanies.set(next.companyId, next); return normalizeCompany(structuredClone(next));
  }
  cloud();
  try {
    await AiManagementCompany.updateOne({ companyId: input.companyId }, { $setOnInsert: defaultCompanyManagement(input.companyId, input.companyName) }, { upsert: true });
  } catch (error) { if (!duplicate(error)) throw error; }
  const { version, createdAt: _created, updatedAt: _updated, ...fields } = value;
  const saved = await AiManagementCompany.findOneAndUpdate(
    { companyId: input.companyId, version }, { $set: { ...fields, version: version + 1 } }, { new: true },
  ).lean();
  if (!saved) throw new AppError('Company management changed in another worker. Refresh and retry.', 409, 'AI_MANAGEMENT_CONFLICT');
  return normalizeCompany(toPlain<AiManagementCompanyRecord>(saved));
}

export async function listCompanyManagement(): Promise<AiManagementCompanyRecord[]> {
  if (env.STORAGE_MODE === 'memory') return structuredClone([...memoryCompanies.values()]).map(normalizeCompany)
    .sort((a, b) => +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0));
  cloud();
  return (await AiManagementCompany.find().sort({ updatedAt: -1 }).lean()).map(row => normalizeCompany(toPlain<AiManagementCompanyRecord>(row)));
}

export async function listDueCompanies(now: Date, limit = 25): Promise<AiManagementCompanyRecord[]> {
  if (env.STORAGE_MODE === 'memory') return (await listCompanyManagement())
    .filter(row => row.managementState === 'ACTIVE' && row.nextActionAt && +new Date(row.nextActionAt) <= +now)
    .sort((a, b) => +new Date(a.nextActionAt!) - +new Date(b.nextActionAt!)).slice(0, limit);
  cloud();
  return (await AiManagementCompany.find({ managementState: 'ACTIVE', nextActionAt: { $lte: now } }).sort({ nextActionAt: 1 }).limit(limit).lean())
    .map(row => normalizeCompany(toPlain<AiManagementCompanyRecord>(row)));
}

export async function findEnrolledByContactEmail(email: string): Promise<AiManagementCompanyRecord[]> {
  const normalized = email.trim().toLowerCase();
  if (env.STORAGE_MODE === 'memory') return (await listCompanyManagement()).filter(row => row.contactEmail?.toLowerCase() === normalized && row.managementState !== 'OFF');
  cloud();
  return (await AiManagementCompany.find({ contactEmail: normalized, managementState: { $ne: 'OFF' } }).lean())
    .map(row => normalizeCompany(toPlain<AiManagementCompanyRecord>(row)));
}

export async function createAiNotification(input: Omit<AiManagementNotificationRecord, 'createdAt' | 'unread' | 'status'>
  & { createdAt?: Date; unread?: boolean; status?: AiManagementNotificationRecord['status'] }) {
  const value: AiManagementNotificationRecord = { ...input, unread: input.unread ?? true, status: input.status ?? 'OPEN', createdAt: input.createdAt ?? new Date() };
  if (env.STORAGE_MODE === 'memory') {
    const prior = memoryNotifications.get(value.notificationId);
    if (prior) return structuredClone(prior);
    memoryNotifications.set(value.notificationId, structuredClone(value)); return structuredClone(value);
  }
  cloud();
  const saved = await AiManagementNotification.findOneAndUpdate({ notificationId: value.notificationId },
    { $setOnInsert: value }, { upsert: true, new: true }).lean();
  return toPlain<AiManagementNotificationRecord>(saved);
}

export interface NotificationFilters {
  unread?: boolean; priority?: string; type?: string; requiresAction?: boolean; status?: string; companyId?: string; page: number; limit: number;
}
export async function listAiNotifications(input: NotificationFilters) {
  const match = (item: AiManagementNotificationRecord) => (input.unread === undefined || item.unread === input.unread)
    && (!input.priority || item.priority === input.priority) && (!input.type || item.type === input.type)
    && (input.requiresAction === undefined || item.requiresAction === input.requiresAction)
    && (!input.status || (input.status === 'UNRESOLVED' ? item.status !== 'RESOLVED' : item.status === input.status))
    && (!input.companyId || item.companyId === input.companyId);
  if (env.STORAGE_MODE === 'memory') {
    const all = [...memoryNotifications.values()];
    const rows = all.filter(match).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return { data: structuredClone(rows.slice((input.page - 1) * input.limit, input.page * input.limit)), total: rows.length,
      unreadCount: all.filter(item => item.unread).length,
      openActionCount: all.filter(item => item.requiresAction && item.status !== 'RESOLVED').length };
  }
  cloud();
  const query: Record<string, unknown> = {};
  if (input.unread !== undefined) query.unread = input.unread;
  if (input.priority) query.priority = input.priority;
  if (input.type) query.type = input.type;
  if (input.requiresAction !== undefined) query.requiresAction = input.requiresAction;
  if (input.status) query.status = input.status === 'UNRESOLVED' ? { $ne: 'RESOLVED' } : input.status;
  if (input.companyId) query.companyId = input.companyId;
  const [data, total, unreadCount, openActionCount] = await Promise.all([
    AiManagementNotification.find(query).sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean(),
    AiManagementNotification.countDocuments(query),
    AiManagementNotification.countDocuments({ unread: true }),
    AiManagementNotification.countDocuments({ requiresAction: true, status: { $ne: 'RESOLVED' } }),
  ]);
  return { data: data.map(row => toPlain<AiManagementNotificationRecord>(row)), total, unreadCount, openActionCount };
}

export async function updateAiNotification(notificationId: string, fields: Partial<Pick<AiManagementNotificationRecord,
  'unread' | 'status' | 'owner' | 'resolvedAt' | 'resolvedBy' | 'resolution'>>) {
  if (env.STORAGE_MODE === 'memory') {
    const item = memoryNotifications.get(notificationId);
    if (!item) throw new AppError('Notification was not found.', 404, 'AI_NOTIFICATION_NOT_FOUND');
    const next = { ...item, ...structuredClone(fields) }; memoryNotifications.set(notificationId, next); return structuredClone(next);
  }
  cloud();
  const saved = await AiManagementNotification.findOneAndUpdate({ notificationId }, { $set: fields }, { new: true }).lean();
  if (!saved) throw new AppError('Notification was not found.', 404, 'AI_NOTIFICATION_NOT_FOUND');
  return toPlain<AiManagementNotificationRecord>(saved);
}

export async function markAiNotificationRead(notificationId: string) { return updateAiNotification(notificationId, { unread: false }); }

export async function markAllAiNotificationsRead() {
  if (env.STORAGE_MODE === 'memory') { for (const [key, value] of memoryNotifications) memoryNotifications.set(key, { ...value, unread: false }); return; }
  cloud();
  await AiManagementNotification.updateMany({ unread: true }, { $set: { unread: false } });
}

/** Acknowledge every open action item for a company, e.g. when a salesperson takes ownership. */
export async function updateCompanyNotifications(companyId: string, fields: Partial<Pick<AiManagementNotificationRecord, 'status' | 'owner' | 'unread' | 'resolvedAt' | 'resolvedBy' | 'resolution'>>, onlyStatus: AiManagementNotificationRecord['status'][] = ['OPEN']) {
  if (env.STORAGE_MODE === 'memory') {
    for (const [key, value] of memoryNotifications) if (value.companyId === companyId && value.requiresAction && onlyStatus.includes(value.status)) memoryNotifications.set(key, { ...value, ...fields });
    return;
  }
  cloud();
  await AiManagementNotification.updateMany({ companyId, requiresAction: true, status: { $in: onlyStatus } }, { $set: fields });
}

export async function getAiNotification(notificationId: string) {
  if (env.STORAGE_MODE === 'memory') return structuredClone(memoryNotifications.get(notificationId) ?? null);
  cloud();
  const saved = await AiManagementNotification.findOne({ notificationId }).lean();
  return saved ? toPlain<AiManagementNotificationRecord>(saved) : null;
}

export async function allAiNotifications(): Promise<AiManagementNotificationRecord[]> {
  if (env.STORAGE_MODE === 'memory') return structuredClone([...memoryNotifications.values()]);
  cloud();
  return (await AiManagementNotification.find().lean()).map(row => toPlain<AiManagementNotificationRecord>(row));
}

export async function saveDailyRankingRun(input: DailyRankingRunRecord) {
  if (env.STORAGE_MODE === 'memory') { memoryRuns.set(input.runId, structuredClone(input)); return structuredClone(input); }
  cloud();
  const saved = await DailyRankingRun.findOneAndUpdate({ runId: input.runId }, { $set: input }, { upsert: true, new: true }).lean();
  return toPlain<DailyRankingRunRecord>(saved);
}

export async function getDailyRankingRun(runId: string) {
  if (env.STORAGE_MODE === 'memory') return structuredClone(memoryRuns.get(runId) ?? null);
  cloud();
  const saved = await DailyRankingRun.findOne({ runId }).lean();
  return saved ? toPlain<DailyRankingRunRecord>(saved) : null;
}

export async function listDailyRankingRuns(limit = 30) {
  if (env.STORAGE_MODE === 'memory') return structuredClone([...memoryRuns.values()].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)).slice(0, limit));
  cloud();
  return (await DailyRankingRun.find().sort({ startedAt: -1 }).limit(limit).lean()).map(row => toPlain<DailyRankingRunRecord>(row));
}

/** Every company ever placed in a daily queue, used to avoid re-selecting the same company. */
export async function previouslyQueuedCompanyIds(): Promise<Set<string>> {
  if (env.STORAGE_MODE === 'memory') return new Set([...memoryRuns.values()].filter(run => run.status === 'COMPLETED').flatMap(run => run.companyIds));
  cloud();
  return new Set((await DailyRankingRun.distinct('companyIds', { status: 'COMPLETED' })) as string[]);
}

export async function acquireAiManagementLease(leaseKey: string, leaseMs = 300000) {
  const now = new Date(), ownerId = randomUUID(), leaseUntil = new Date(+now + leaseMs);
  if (env.STORAGE_MODE === 'memory') {
    const current = memoryLeases.get(leaseKey);
    if (current && +current.leaseUntil > +now) return null;
    memoryLeases.set(leaseKey, { ownerId, leaseUntil }); return ownerId;
  }
  cloud();
  try {
    await AiManagementLease.updateOne({ leaseKey }, { $setOnInsert: { leaseKey, ownerId: '', leaseUntil: new Date(0) } }, { upsert: true });
  } catch (error) { if (!duplicate(error)) throw error; }
  const saved = await AiManagementLease.findOneAndUpdate({ leaseKey, leaseUntil: { $lte: now } },
    { $set: { ownerId, leaseUntil } }, { new: true }).lean();
  return saved ? ownerId : null;
}

export async function releaseAiManagementLease(leaseKey: string, ownerId: string) {
  if (env.STORAGE_MODE === 'memory') {
    if (memoryLeases.get(leaseKey)?.ownerId === ownerId) memoryLeases.set(leaseKey, { ownerId: '', leaseUntil: new Date(0) });
    return;
  }
  cloud();
  await AiManagementLease.updateOne({ leaseKey, ownerId }, { $set: { ownerId: '', leaseUntil: new Date(0) } });
}

export function clearMemoryAiManagement() {
  memoryCompanies.clear(); memoryNotifications.clear(); memoryRuns.clear(); memoryLeases.clear();
  memorySettings = structuredClone(DEFAULT_AI_MANAGEMENT_SETTINGS);
}
