import mongoose, { Document, Model, Schema } from 'mongoose';

export const SALES_EVENT_TYPES = [
  'DISCOVERED', 'QUALIFIED', 'SELECTED', 'CONTACT_IDENTIFIED', 'EMAIL_DRAFTED', 'EMAIL_APPROVED',
  'EMAIL_PROVIDER_ACCEPTED', 'EMAIL_FAILED', 'REPLY_RECEIVED', 'REPLY_CLASSIFIED', 'INTERVENTION_CREATED',
  'INTERVENTION_UPDATED', 'FEEDBACK_CAPTURED', 'MEETING_REQUESTED', 'MEETING_SCHEDULED', 'CONVERTED',
  'DISQUALIFIED', 'AGENT_EXECUTION',
] as const;
export type SalesEventType = typeof SALES_EVENT_TYPES[number];
export const REPLY_INTENTS = ['INTERESTED', 'NOT_INTERESTED', 'REQUEST_FOR_INFORMATION', 'MEETING_REQUEST', 'NEGOTIATION', 'EXISTING_PROVIDER', 'REFERRAL', 'OUT_OF_OFFICE', 'UNSUBSCRIBE', 'COMPLAINT', 'OTHER'] as const;
export const INTERVENTION_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
export const INTERVENTION_REASONS = ['PRICING_APPROVAL', 'TECHNICAL_CLARIFICATION', 'LEGAL_REVIEW', 'COMPLAINT_HANDLING', 'MEETING_COORDINATION', 'LOW_AI_CONFIDENCE', 'COMPLEX_NEGOTIATION', 'UNCLEAR_REQUIREMENT', 'HIGH_VALUE_OPPORTUNITY', 'OTHER'] as const;

export interface ISalesActivity {
  eventId: string;
  type: SalesEventType;
  companyId: string;
  companyName: string;
  researchId?: string;
  opportunityId?: string;
  contactId?: string;
  contactName?: string;
  contactEmail?: string;
  country?: string;
  industry?: string;
  service?: string;
  agent?: string;
  success?: boolean;
  executionMs?: number;
  intent?: typeof REPLY_INTENTS[number];
  sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  confidence?: number;
  reason?: typeof INTERVENTION_REASONS[number];
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  assignedTo?: string;
  status?: typeof INTERVENTION_STATUSES[number];
  subject?: string;
  body?: string;
  provider?: 'MOCK';
  providerMessageId?: string;
  dedupeKey?: string;
  sourceIds: string[];
  payload: Record<string, unknown>;
  isSynthetic: boolean;
  createdAt: Date;
}
export interface ISalesActivityDocument extends ISalesActivity, Document {}

const SalesActivitySchema = new Schema<ISalesActivityDocument>({
  eventId: { type: String, required: true, unique: true },
  type: { type: String, enum: SALES_EVENT_TYPES, required: true, index: true },
  companyId: { type: String, required: true, index: true }, companyName: { type: String, required: true },
  researchId: String, opportunityId: String, contactId: String, contactName: String, contactEmail: String,
  country: String, industry: String, service: String, agent: String, success: Boolean, executionMs: Number,
  intent: { type: String, enum: REPLY_INTENTS }, sentiment: { type: String, enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] },
  confidence: { type: Number, min: 0, max: 1 }, reason: { type: String, enum: INTERVENTION_REASONS },
  priority: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] }, assignedTo: String,
  status: { type: String, enum: INTERVENTION_STATUSES }, subject: String, body: String,
  provider: { type: String, enum: ['MOCK'] }, providerMessageId: String, dedupeKey: String,
  sourceIds: { type: [String], default: [] }, payload: { type: Schema.Types.Mixed, default: {} },
  isSynthetic: { type: Boolean, required: true, default: false },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'sales_activity_events' });
SalesActivitySchema.index({ companyId: 1, createdAt: -1 });
SalesActivitySchema.index({ type: 1, createdAt: -1 });
SalesActivitySchema.index({ status: 1, priority: 1, createdAt: -1 });

export const SalesActivity: Model<ISalesActivityDocument> = mongoose.models.SalesActivity
  ?? mongoose.model<ISalesActivityDocument>('SalesActivity', SalesActivitySchema);
