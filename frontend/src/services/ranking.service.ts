export type View = 'crm_plus_public' | 'crm_only' | 'deal_value'
export type Status = 'Pursue' | 'Verify' | 'Resolve' | 'Monitor' | 'Blocked'
export const PRIORITY_STATUSES = ['Very urgent', 'Urgent', 'Normal priority', 'Low priority', 'Irrelevant'] as const
export type PriorityStatus = typeof PRIORITY_STATUSES[number]
export interface Evidence { id: string; title: string; origin: string; date: string; excerpt: string;
  url: string | null; locator: string; claimStatus: string; entity: string; site: string; sourceFamily: string }
export interface Decision { rank: number; score: number; status: Status; priorityStatus: PriorityStatus; actionCode: string; nextAction: string; priorityBand: string; confidence: number | null }
export interface Opportunity extends Omit<Decision, 'confidence'> {
  customerCheck?: { result: 'not_found_in_mock_customer_database'; databaseVersion: string; databaseUpdatedAt: string; isMock: true; limitation: string };
  id: string; account: string; parent: string; buyingUnit: string; address: string; product: string;
  useCase: string; buyingWindowId: string; owner: string; deadline: string | null; deadlineKind: string;
  readyBy: string; annualDealValueSgd: number; annualContributionSgd: number; pursuitHours: number;
  previousRank: number | null; movement: number | 'NEW'; taskDueAt: string;
  gates: { gate: string; state: string; condition: string; actual: string; reason: string; evidenceIds: string[] }[];
  components: { name: string; points: number; max: number; reason: string; evidenceIds: string[] }[];
  strongestEvidence: Evidence; evidence: Evidence[]; previousDecision: Decision | null; changedFact: string | null;
  assessment?: { model: string | null; responseId: string | null; evaluatedAt: string | null; reason: string;
    urgencyReasons: string[]; confidenceReasons: string[]; evidenceIds: string[]; pending?: boolean };
  rankingConfidence: { method?: 'llm_assessment' | 'scenario_stability'; reason?: string;
    score: number | null; retainedScenarios: number | null; scenarioCount: number;
    minRank: number | null; maxRank: number | null; actionScore: number | null; verifyNext: string;
    insufficientEvidenceReason: string | null; scenarios: { id: string; name: string; rank: number; band: string; score: number; status: Status; actionCode: string }[] };
  publicContribution: number; originalCrmDiscovery: boolean;
}
export interface Queue { items: Opportunity[]; total: number; view: View; queueVersion: string;
  customerEligibility?: { policy: 'exclude_known_singtel_customers'; isMock: true; databaseVersion: string };
  asOf: string; queueComputedAt: string; eventCursor: number; initialized: boolean; degraded: boolean;
  lastSuccessfulRefreshAt: string | null; lastAttemptAt: string; sourceError: string | null;
  rubricVersion: string; scenarioVersion: string; fixtureVersion: string;
  llm?: { mode: 'llm' | 'rules_preview'; status: 'ready' | 'needs_key' | 'failed' | 'stale'; model: string | null;
    evaluatedAt: string | null; attemptedAt: string; inputHash: string; error: string | null; code: string | null; promptVersion: string; responseId: string | null } }
export interface ReplayEvent { eventId: string; eventType: string; aggregateId: string;
  aggregateVersion: number; payload: Record<string, unknown>; description?: string }
export interface Source { id: string; sourceFamily: string; sourceUrl: string; excerpt: string;
  publishedAt: string | null; retrievedAt: string; locator: string; claimStatus: string; claims: Record<string, unknown> }
export interface Meta { events: ReplayEvent[]; appliedEventIds: string[];
  aggregateVersions: Record<string, number>;
  history: { eventId: string; eventType: string; fact: string; at: string;
    changes: { id: string; before: Decision | null; after: Decision }[] }[];
  sources: Source[]; evidence: Evidence[]; crm: Record<string, unknown[]>;
  liveExtractionConfigured: boolean; clockMode: string; persistence: string;
  rankingMode?: 'llm' | 'rules'; openAi?: { configured: boolean; source: 'environment' | 'session' | null; model: string } | null }
export interface Comparison {
  note: string; universe: string[]; eventCursor: number; asOf: string;
  summaries: Record<View, { topFive: string[]; pursueInTopFive: number; verifyOrResolveInTopFive: number }>;
  rows: { id: string; publicRank: number; crmRank: number; valueRank: number; publicScore: number; crmScore: number; addedPoints: number; evidenceIds: string[] }[];
  ablations: { family: string; removedProvenanceGroups: string[]; topFive: string[]; changedRows: string[] }[];
}
export async function rankingRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')}/api/v1/ranking${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000),
  })
  const result = await response.json()
  if (!response.ok) throw new RankingRequestError(result.message || `Request failed (${response.status})`, result.code)
  return result as T
}
export class RankingRequestError extends Error {
  constructor(message: string, public code?: string) { super(message) }
}
