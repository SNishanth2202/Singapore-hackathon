import mongoose, { Document, Model, Schema } from 'mongoose';

/** Automation configuration state: whether the AI may act for this company. */
export const MANAGEMENT_STATES = ['OFF', 'ACTIVATING', 'ACTIVE', 'PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER', 'COMPLETED', 'ERROR'] as const;
export type ManagementState = typeof MANAGEMENT_STATES[number];
/** Communication lifecycle state: where the email conversation is. Independent of the opportunity lifecycle in SalesActivity. */
export const COMMUNICATION_STATES = ['READY', 'OUTREACH_SENT', 'WAITING_FOR_REPLY', 'FOLLOW_UP_SCHEDULED', 'CUSTOMER_RESPONDED',
  'NO_RESPONSE', 'NOT_INTERESTED', 'UNSUBSCRIBED', 'COMPLETED', 'ERROR'] as const;
export type CommunicationState = typeof COMMUNICATION_STATES[number];
export const NEXT_ACTION_KINDS = ['INITIAL_OUTREACH', 'NO_REPLY_FOLLOWUP', 'CUSTOMER_REQUESTED_FOLLOWUP', 'NO_RESPONSE_CLOSE'] as const;
export type NextActionKind = typeof NEXT_ACTION_KINDS[number];

export interface MemoryItem { text: string; sourceEventId: string; at: string; serviceIds?: string[] }
export interface PendingAction { id: string; type: string; description: string; sourceEventId: string; status: 'OPEN' | 'DONE'; createdAt: string; closedAt?: string }
export interface CompanyMemory {
  summary: string;
  requirements: MemoryItem[]; preferences: MemoryItem[]; questions: MemoryItem[]; answers: MemoryItem[];
  objections: MemoryItem[]; existingProviders: MemoryItem[]; buyingSignals: MemoryItem[]; promises: MemoryItem[];
  pendingActions: PendingAction[];
}
export interface ScoreChange { at: string; previous: number | null; score: number; reason: string; sourceEventId: string }
export interface StateChange {
  at: string; actor: string; reason: string;
  fromManagement: ManagementState; toManagement: ManagementState;
  fromCommunication: CommunicationState; toCommunication: CommunicationState;
}
export interface ActivationAuthorization {
  version: string; statement: string; acknowledgedBy: string; acknowledgedAt: string;
  complianceReviewed: true; jurisdiction: string; outreachBasis: string;
}

export interface AiManagementCompanyRecord {
  companyId: string; companyName: string; researchId?: string; opportunityId?: string;
  country?: string; industry?: string; priority?: string; product?: string; leadScore?: number | null; leadConfidence?: number | null;
  contactId?: string; contactEmail?: string; contactName?: string; contactRole?: string; jurisdiction?: string; outreachBasis?: string;
  managementState: ManagementState; communicationState: CommunicationState;
  activationId?: string; activatedAt?: Date; activatedBy?: string; authorization?: ActivationAuthorization; consentVersion?: string;
  pausedAt?: Date; pauseReason?: string; resumedAt?: Date; humanOwner?: string; handoverAt?: Date; humanAttention?: boolean; attentionReason?: string;
  completedAt?: Date; disabledAt?: Date; disabledBy?: string;
  lastMessageAt?: Date; lastInboundAt?: Date; lastOutboundAt?: Date; initialSentAt?: Date; lastHandledInboundAt?: Date;
  nextActionAt?: Date | null; nextActionKind?: NextActionKind | null; nextActionNote?: string | null;
  followupAttempts: number; lastError?: string | null;
  opportunityScore?: number | null; scoreHistory?: ScoreChange[];
  memory?: CompanyMemory; history?: StateChange[];
  version: number; createdAt?: Date; updatedAt?: Date;
}
export interface AiManagementCompanyDocument extends AiManagementCompanyRecord, Document {}
const companySchema = new Schema<AiManagementCompanyDocument>({
  companyId: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, required: true }, researchId: String, opportunityId: String,
  country: String, industry: String, priority: String, product: String, leadScore: Number, leadConfidence: Number,
  contactId: String, contactEmail: { type: String, index: true }, contactName: String, contactRole: String, jurisdiction: String, outreachBasis: String,
  managementState: { type: String, enum: MANAGEMENT_STATES, required: true, default: 'OFF', index: true },
  communicationState: { type: String, enum: COMMUNICATION_STATES, required: true, default: 'READY', index: true },
  activationId: String, activatedAt: Date, activatedBy: String, authorization: Schema.Types.Mixed, consentVersion: String,
  pausedAt: Date, pauseReason: String, resumedAt: Date, humanOwner: String, handoverAt: Date, humanAttention: Boolean, attentionReason: String,
  completedAt: Date, disabledAt: Date, disabledBy: String,
  lastMessageAt: Date, lastInboundAt: Date, lastOutboundAt: Date, initialSentAt: Date, lastHandledInboundAt: Date,
  nextActionAt: Date, nextActionKind: { type: String, enum: [...NEXT_ACTION_KINDS, null] }, nextActionNote: String,
  followupAttempts: { type: Number, default: 0 }, lastError: String,
  opportunityScore: Number, scoreHistory: { type: [Schema.Types.Mixed], default: [] },
  memory: Schema.Types.Mixed, history: { type: [Schema.Types.Mixed], default: [] },
  version: { type: Number, required: true, default: 0 },
}, { timestamps: true, collection: 'ai_management_companies' });
companySchema.index({ managementState: 1, nextActionAt: 1 });

export interface AiManagementSettingsRecord {
  settingsKey: 'global'; version: number; dailyRankingEnabled: boolean; dailyTarget: number; preferredTime: string; timezone: string;
  minimumScore: number; minimumConfidence: number; globalOutboundEnabled: boolean;
  /** Days to wait after the most recent outbound message before each successive no-reply follow-up. */
  followupIntervalsDays: number[];
  maxFollowups: number; noResponseCloseDays: number;
  /** Threshold for autonomous replies to customer questions. */
  minimumAutoConfidence: number;
  /** Threshold for proactive outreach and follow-ups that use only evidence-grounded content. */
  minimumOutreachConfidence: number;
  maxProactiveEmailsPer7Days: number; minimumHoursBetweenProactiveEmails: number;
  /** ISO country codes where only recorded consent, an existing relationship or an inbound request permits automated outreach. */
  consentOnlyJurisdictions: string[];
  inboxPollIntervalMinutes: number; lastEmailPollAt?: Date | null;
  outboundStoppedAt?: Date | null; outboundStopReason?: string | null;
}
export interface AiManagementSettingsDocument extends AiManagementSettingsRecord, Document {}
const settingsSchema = new Schema<AiManagementSettingsDocument>({
  settingsKey: { type: String, required: true, unique: true, default: 'global' }, version: { type: Number, default: 0 },
  dailyRankingEnabled: { type: Boolean, default: false }, dailyTarget: { type: Number, min: 1, max: 200, default: 20 },
  preferredTime: { type: String, default: '09:00' }, timezone: { type: String, default: 'Asia/Singapore' },
  minimumScore: { type: Number, min: 0, max: 100, default: 50 }, minimumConfidence: { type: Number, min: 0, max: 100, default: 60 },
  globalOutboundEnabled: { type: Boolean, default: true }, followupIntervalsDays: { type: [Number], default: [4, 7] },
  maxFollowups: { type: Number, min: 0, max: 5, default: 2 }, noResponseCloseDays: { type: Number, min: 1, max: 60, default: 7 },
  minimumAutoConfidence: { type: Number, min: 0, max: 1, default: 0.72 },
  minimumOutreachConfidence: { type: Number, min: 0, max: 1, default: 0.5 },
  maxProactiveEmailsPer7Days: { type: Number, min: 1, max: 10, default: 2 },
  minimumHoursBetweenProactiveEmails: { type: Number, min: 1, max: 720, default: 48 },
  consentOnlyJurisdictions: { type: [String], default: [] },
  inboxPollIntervalMinutes: { type: Number, min: 1, max: 30, default: 2 }, lastEmailPollAt: Date,
  outboundStoppedAt: Date, outboundStopReason: String,
}, { timestamps: true, collection: 'ai_management_settings' });

export const NOTIFICATION_TYPES = ['POSITIVE_REPLY', 'MEETING_REQUEST', 'PROPOSAL_REQUEST', 'PRICING_REQUEST', 'HUMAN_INTERVENTION',
  'NEW_REQUIREMENTS', 'FUTURE_OPPORTUNITY', 'FOLLOWUP_FAILED', 'EMAIL_DELIVERY_FAILED', 'OUTREACH_BLOCKED', 'AI_MANAGEMENT_ERROR',
  'UNSUBSCRIBED', 'NOT_INTERESTED', 'NO_RESPONSE', 'REPLY_DURING_HANDOVER', 'EMERGENCY_STOP'] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export interface AiManagementNotificationRecord {
  notificationId: string; eventId: string; companyId: string; companyName: string; type: NotificationType | string;
  priority: NotificationPriority; title: string; summary: string; latestMessage?: string;
  contactName?: string; contactEmail?: string; reason?: string;
  intent?: string; buyingIntent?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'; sentiment?: string;
  buyingSignals?: string[]; requirements?: string[];
  recommendation?: string; opportunityScore?: number | null;
  requiresAction: boolean; status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; owner?: string;
  unread: boolean; createdAt: Date; resolvedAt?: Date; resolvedBy?: string; resolution?: string;
}
export interface AiManagementNotificationDocument extends AiManagementNotificationRecord, Document {}
const notificationSchema = new Schema<AiManagementNotificationDocument>({
  notificationId: { type: String, required: true, unique: true }, eventId: { type: String, required: true },
  companyId: { type: String, required: true, index: true }, companyName: { type: String, required: true },
  type: { type: String, required: true, index: true }, priority: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], required: true, index: true },
  title: { type: String, required: true }, summary: { type: String, required: true }, latestMessage: String,
  contactName: String, contactEmail: String, reason: String, intent: String, buyingIntent: String, sentiment: String,
  buyingSignals: { type: [String], default: [] }, requirements: { type: [String], default: [] },
  recommendation: String, opportunityScore: Number,
  requiresAction: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], default: 'OPEN', index: true }, owner: String,
  unread: { type: Boolean, default: true, index: true }, createdAt: { type: Date, default: Date.now },
  resolvedAt: Date, resolvedBy: String, resolution: String,
}, { timestamps: { createdAt: false, updatedAt: true }, collection: 'ai_management_notifications' });
notificationSchema.index({ unread: 1, createdAt: -1 });
notificationSchema.index({ requiresAction: 1, status: 1, createdAt: -1 });

export interface SelectedLead {
  companyId: string; companyName: string; opportunityId: string; rank: number; score: number;
  confidence: number | null; status: string; priority: string; product: string; nextAction: string; sourceIds: string[];
  country?: string | null; industry?: string | null; summary?: string | null;
}
export interface DailyRankingRunRecord {
  runId: string; localDate: string; status: 'RUNNING' | 'COMPLETED' | 'FAILED'; trigger?: 'SCHEDULED' | 'MANUAL';
  startedAt: Date; completedAt?: Date; target?: number; discovered: number; ranked: number; selected: number; rejected: number; skipped: number;
  companyIds: string[]; selectedLeads: SelectedLead[]; error?: string; queueVersion?: string;
}
export interface DailyRankingRunDocument extends DailyRankingRunRecord, Document {}
const runSchema = new Schema<DailyRankingRunDocument>({
  runId: { type: String, required: true, unique: true }, localDate: { type: String, required: true, index: true },
  status: { type: String, enum: ['RUNNING', 'COMPLETED', 'FAILED'], required: true, index: true }, trigger: String,
  startedAt: { type: Date, required: true }, completedAt: Date, target: Number, discovered: { type: Number, default: 0 },
  ranked: { type: Number, default: 0 }, selected: { type: Number, default: 0 }, rejected: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 }, companyIds: { type: [String], default: [] },
  selectedLeads: { type: Schema.Types.Mixed, default: [] }, error: String, queueVersion: String,
}, { timestamps: true, collection: 'ai_management_daily_runs' });
runSchema.index({ localDate: -1, startedAt: -1 });

export interface AiManagementLeaseDocument extends Document { leaseKey: string; ownerId: string; leaseUntil: Date }
const leaseSchema = new Schema<AiManagementLeaseDocument>({
  leaseKey: { type: String, required: true, unique: true }, ownerId: { type: String, default: '' },
  leaseUntil: { type: Date, required: true, default: new Date(0) },
}, { timestamps: true, collection: 'ai_management_leases' });

export const AiManagementCompany: Model<AiManagementCompanyDocument> = mongoose.models.AiManagementCompany
  ?? mongoose.model<AiManagementCompanyDocument>('AiManagementCompany', companySchema);
export const AiManagementSettings: Model<AiManagementSettingsDocument> = mongoose.models.AiManagementSettings
  ?? mongoose.model<AiManagementSettingsDocument>('AiManagementSettings', settingsSchema);
export const AiManagementNotification: Model<AiManagementNotificationDocument> = mongoose.models.AiManagementNotification
  ?? mongoose.model<AiManagementNotificationDocument>('AiManagementNotification', notificationSchema);
export const DailyRankingRun: Model<DailyRankingRunDocument> = mongoose.models.DailyRankingRun
  ?? mongoose.model<DailyRankingRunDocument>('DailyRankingRun', runSchema);
export const AiManagementLease: Model<AiManagementLeaseDocument> = mongoose.models.AiManagementLease
  ?? mongoose.model<AiManagementLeaseDocument>('AiManagementLease', leaseSchema);
