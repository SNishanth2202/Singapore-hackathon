import { z } from 'zod';
import type { CustomerCheck, CustomerEligibility } from './customer-eligibility';

export const StatusSchema = z.enum(['Pursue', 'Verify', 'Resolve', 'Monitor', 'Blocked']);
export const PriorityStatusSchema = z.enum(['Very urgent', 'Urgent', 'Normal priority', 'Low priority', 'Irrelevant']);
export const GateStateSchema = z.enum(['PASS', 'UNKNOWN', 'FAIL']);
export type Status = z.infer<typeof StatusSchema>;
export type PriorityStatus = z.infer<typeof PriorityStatusSchema>;
export type GateState = z.infer<typeof GateStateSchema>;
export type View = 'crm_plus_public' | 'crm_only' | 'deal_value';
export type Band = 'WORK_NOW' | 'NEXT' | 'WAITING' | 'BLOCKED';
const timestamp = z.string().datetime({ offset: true });
export const OpportunitySchema = z.object({
  id: z.string().min(1), accountId: z.string(), account: z.string(), parent: z.string(),
  buyingUnitId: z.string(), buyingUnit: z.string(), siteId: z.string(), address: z.string(),
  // The seed queue uses three concrete products; Discovery can add a catalogue-backed
  // service hypothesis without pretending it is already a configured SKU.
  product: z.string().min(1).max(200),
  useCase: z.string(), buyingWindowId: z.string(), ownerId: z.string(), owner: z.string(),
  contactId: z.string(), need: z.union([z.literal(0), z.literal(8), z.literal(15)]),
  needOrigin: z.enum(['public', 'mock_salesforce']), evidenceIds: z.array(z.string()),
  needEvidenceIds: z.array(z.string()).default([]), catalogAvailable: z.boolean().default(true),
  deadline: timestamp.nullable(), deadlineKind: z.string(), windowConfirmed: z.boolean(),
  deadlineAlternatives: z.array(timestamp), readyBy: timestamp,
  siteState: GateStateSchema, technicalState: GateStateSchema,
  siteAssessedAt: timestamp, technicalAssessedAt: timestamp,
  siteEvidenceId: z.string(), technicalEvidenceId: z.string(),
  diversePaths: z.number().int().nonnegative().nullable(), latencyMs: z.number().nonnegative().nullable(),
  directFit: z.boolean(), recentActivityAt: timestamp.nullable(),
  annualContributionSgd: z.number().nonnegative(), annualDealValueSgd: z.number().nonnegative(),
  pursuitHours: z.number().nonnegative(), estimated: z.boolean(),
  caseOpen: z.boolean(), caseDueAt: timestamp.nullable(),
  matchStatus: z.enum(['verified', 'ambiguous']), matchCandidates: z.array(z.string()),
  unbounded: z.boolean(), siteUncertain: z.boolean(), hiddenUntilTrigger: z.boolean(),
  isSynthetic: z.literal(true),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const SourceSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), sourceFamily: z.string(),
  sourceUrl: z.string().url().refine(v => v.startsWith('https://'), 'HTTPS source required'),
  locator: z.string(), publishedAt: z.string().nullable(), effectiveAt: z.string().nullable(),
  retrievedAt: z.string(), excerpt: z.string(), entityHints: z.array(z.object({ name: z.string(), role: z.string() })),
  matchedEntityId: z.string().nullable(), matchedSiteId: z.string().nullable(),
  matchStatus: z.enum(['unreviewed', 'verified', 'ambiguous', 'unmatched']),
  claimStatus: z.enum(['observed', 'inferred', 'synthetic', 'disputed', 'superseded']),
  origin: z.enum(['public', 'mock_salesforce', 'mock_engineering']),
  claims: z.record(z.string(), z.unknown()), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  provenanceGroupId: z.string().optional(),
}).passthrough();
export type SourceRecord = z.infer<typeof SourceSchema>;
export interface Evidence {
  id: string; title: string; origin: 'public' | 'mock_salesforce' | 'mock_engineering';
  date: string; excerpt: string; url: string | null; locator: string; claimStatus: string;
  entity: string; site: string; sourceFamily: string;
}
export interface GateResult { gate: 'site' | 'technical' | 'deadline'; state: GateState;
  condition: string; actual: string; evidenceIds: string[]; reason: string; }
export interface Component { name: string; points: number; max: number; reason: string; evidenceIds: string[]; }
export interface Decision {
  rank: number; score: number; status: Status; priorityStatus: PriorityStatus; actionCode: string; nextAction: string;
  priorityBand: Band; confidence: number | null;
}
export interface ScenarioResult { id: string; name: string; rank: number; band: Band; score: number;
  status: Status; actionCode: string; }
export interface QueueRow extends Opportunity {
  customerCheck?: CustomerCheck;
  rank: number; previousRank: number | null; movement: number | 'NEW'; score: number;
  status: Status; priorityStatus: PriorityStatus; priorityBand: Band; actionCode: string; nextAction: string; taskDueAt: string;
  gates: GateResult[]; components: Component[]; strongestEvidence: Evidence;
  evidence: Evidence[]; previousDecision: Decision | null; changedFact: string | null;
  assessment?: { model: string | null; responseId: string | null; evaluatedAt: string | null;
    reason: string; urgencyReasons: string[]; confidenceReasons: string[]; evidenceIds: string[]; pending?: boolean };
  rankingConfidence: { method?: 'llm_assessment' | 'scenario_stability'; reason?: string;
    score: number | null; retainedScenarios: number | null; scenarioCount: number;
    minRank: number | null; maxRank: number | null; actionScore: number | null;
    verifyNext: string; insufficientEvidenceReason: string | null; scenarios: ScenarioResult[]; };
  publicContribution: number; originalCrmDiscovery: boolean;
}
export interface QueueSnapshot {
  customerEligibility?: CustomerEligibility;
  items: QueueRow[]; total: number; view: View; queueVersion: string; queueComputedAt: string;
  asOf: string; eventCursor: number; initialized: boolean; degraded: boolean;
  lastSuccessfulRefreshAt: string | null; lastAttemptAt: string; sourceError: string | null;
  rubricVersion: string; scenarioVersion: string; fixtureVersion: string;
  llm?: { mode: 'llm' | 'rules_preview'; status: 'ready' | 'needs_key' | 'failed' | 'stale';
    model: string | null; evaluatedAt: string | null; attemptedAt: string; inputHash: string;
    error: string | null; code: string | null; promptVersion: string; responseId: string | null };
}
export const EventSchema = z.object({
  eventId: z.string().min(1).max(100), aggregateId: z.string(), aggregateVersion: z.number().int().positive(),
  eventType: z.enum(['PublicTriggerImported', 'BuyingWindowConfirmed', 'RenewalNoticeConfirmed',
    'SiteAssessmentCompleted', 'TechnicalAssessmentCompleted', 'ServiceCaseOpened', 'ServiceCaseResolved',
    'AmbiguousMatchDetected', 'MatchVerified', 'AssumptionBoundsRemoved']),
  payload: z.object({ deadline: timestamp.optional(), state: GateStateSchema.optional(),
    latencyMs: z.number().nonnegative().optional(), diversePaths: z.number().int().nonnegative().optional(),
    sourceIds: z.array(z.string()).optional(), candidates: z.array(z.string()).optional(),
  }).strict(),
  description: z.string().optional(),
}).strict();
export type ReplayEvent = z.infer<typeof EventSchema>;
export interface AuditEntry { eventId: string; eventType: string; fact: string; at: string;
  changes: { id: string; before: Decision | null; after: Decision }[]; }
export interface DemoState {
  schemaVersion: 1; runId: string; asOf: string; opportunities: Opportunity[]; sources: SourceRecord[];
  evidence: Evidence[]; versions: Record<string, number>; appliedEvents: Record<string, string>;
  history: AuditEntry[]; snapshots: Record<View, QueueSnapshot>;
  initialized: boolean; sourceError: string | null; lastAttemptAt: string; lastSuccessfulRefreshAt: string | null;
}
export const VIEWS: View[] = ['crm_plus_public', 'crm_only', 'deal_value'];
export const T0 = '2026-11-15T01:00:00.000Z';
export const DAY = 86_400_000;
export const clone = <T>(value: T): T => structuredClone(value);
