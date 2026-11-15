import fs from 'fs';
import path from 'path';
import { AuditEntry, Band, QueueRow, QueueSnapshot, View, clone } from './contracts';
import { RankingService } from './service';
import { hash } from './importer';
import { toDecision } from './engine';
import { REPO_ROOT } from './seed';
import { AppError } from '../utils/errors';
import { assessWithOpenAi, modelInput, ModelAssessment, OpenAiCredential, RANKING_PROMPT_VERSION } from './openai-ranking';

interface ClientState { snapshots: Partial<Record<View, QueueSnapshot>>; history: AuditEntry[]; }
type Scorer = (snapshot: QueueSnapshot, credential: OpenAiCredential) => Promise<ModelAssessment>;
const tier = (row: QueueRow) => row.status === 'Blocked' ? 2 : row.status === 'Monitor' ? 1 : 0;

export class LlmQueueService {
  private clients = new Map<string, ClientState>();
  private pending = new Map<string, Promise<QueueSnapshot>>();
  private failures = new Map<string, { at: number; message: string; code: string }>();
  constructor(private rules: RankingService, private scorer: Scorer = assessWithOpenAi,
    private storePath: string | null = path.join(REPO_ROOT, '.local/llm-ranking-cache.json')) {}
  private client(credential: OpenAiCredential) {
    let state = this.clients.get(credential.namespace);
    if (!state) {
      state = { snapshots: {}, history: [] };
      if (credential.source === 'environment' && this.storePath && fs.existsSync(this.storePath)) {
        try { const saved = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
          if (saved.namespace === credential.namespace && saved.promptVersion === RANKING_PROMPT_VERSION) state = saved.state;
        } catch { /* An invalid cache is regenerated, never passed off as an assessment. */ }
      }
      if (this.clients.size >= 100) this.clients.delete(this.clients.keys().next().value!);
      this.clients.set(credential.namespace, state!);
    }
    return state!;
  }
  private fingerprint(snapshot: QueueSnapshot, credential: OpenAiCredential) {
    // Raw material estimates matter even when they remain in the same baseline points bucket.
    // Exact no-op clock ticks do not force a paid call; ruleVersion captures deadline/staleness thresholds.
    const { asOf: _clock, ...facts } = modelInput(snapshot);
    return hash({ version: snapshot.queueVersion, facts, model: credential.model, prompt: RANKING_PROMPT_VERSION });
  }
  private persist(credential: OpenAiCredential, state: ClientState) {
    if (credential.source !== 'environment' || !this.storePath) return;
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    const temporary = `${this.storePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ namespace: credential.namespace, promptVersion: RANKING_PROMPT_VERSION, state }, null, 2));
    fs.renameSync(temporary, this.storePath);
  }
  history(credential: OpenAiCredential | null) { return credential ? clone([...this.client(credential).history].reverse()) : []; }
  private unavailable(base: QueueSnapshot, credential: OpenAiCredential | null, previous: QueueSnapshot | undefined,
    message: string, code: string, fingerprint = ''): QueueSnapshot {
    // Recheck at the failure boundary, including database changes during an in-flight model call.
    base = this.rules.get(base.view);
    const q = clone(previous || base);
    const eligible = new Map(base.items.map(row => [row.id, row]));
    q.items = q.items.filter(row => eligible.has(row.id));
    q.customerEligibility = clone(base.customerEligibility);
    let working = 0;
    q.items.forEach((row, index) => {
      row.customerCheck = clone(eligible.get(row.id)!.customerCheck); row.rank = index + 1;
      if (tier(row) === 0) working++;
      row.priorityBand = row.status === 'Blocked' ? 'BLOCKED' : row.status === 'Monitor' ? 'WAITING' : working <= 5 ? 'WORK_NOW' : 'NEXT';
    });
    q.total = q.items.length;
    if (previous && q.items.length !== previous.items.length) q.queueVersion = hash({ previous: previous.queueVersion,
      customerDatabase: base.customerEligibility?.databaseVersion, ids: q.items.map(r => r.id) });
    if (!previous) q.items = q.items.map(row => ({ ...row, assessment: { pending: true, model: null, responseId: null,
      evaluatedAt: null, reason: message, urgencyReasons: ['Awaiting AI assessment'], confidenceReasons: ['Awaiting AI assessment'], evidenceIds: [] },
      rankingConfidence: { method: 'llm_assessment', reason: message, score: null, retainedScenarios: null, scenarioCount: 0,
        minRank: null, maxRank: null, actionScore: null, verifyNext: 'Configure the AI connection and assess these leads.',
        insufficientEvidenceReason: message, scenarios: [] } }));
    q.llm = { mode: previous ? 'llm' : 'rules_preview', status: !credential ? 'needs_key' : previous ? 'stale' : 'failed',
      model: previous?.llm?.model || credential?.model || null, evaluatedAt: previous?.llm?.evaluatedAt || null,
      attemptedAt: new Date().toISOString(), inputHash: fingerprint, promptVersion: RANKING_PROMPT_VERSION,
      error: message, code, responseId: previous?.llm?.responseId || null };
    q.degraded = base.degraded; q.sourceError = base.sourceError; q.lastAttemptAt = base.lastAttemptAt;
    q.lastSuccessfulRefreshAt = base.lastSuccessfulRefreshAt;
    return q;
  }
  async get(view: View, credential: OpenAiCredential | null, force = false): Promise<QueueSnapshot> {
    if (view === 'deal_value') {
      const full = await this.get('crm_plus_public', credential, force), q = clone(full);
      q.view = 'deal_value'; q.items.sort((a, b) => b.annualDealValueSgd - a.annualDealValueSgd || a.id.localeCompare(b.id));
      const previous = credential ? this.client(credential).snapshots.deal_value : undefined;
      const version = hash({ full: full.queueVersion, order: q.items.map(r => r.id) });
      if (previous?.queueVersion === version) return { ...clone(previous), degraded: full.degraded, sourceError: full.sourceError, llm: full.llm };
      let actionable = 0;
      q.items.forEach((r, i) => { const prior = previous?.items.find(p => p.id === r.id); r.rank = i + 1;
        r.previousRank = prior?.rank ?? null; r.movement = prior ? prior.rank - r.rank : 'NEW';
        if (tier(r) === 0) actionable++;
        r.priorityBand = r.status === 'Blocked' ? 'BLOCKED' : r.status === 'Monitor' ? 'WAITING' : actionable <= 5 ? 'WORK_NOW' : 'NEXT'; });
      q.queueVersion = version; if (credential) this.client(credential).snapshots.deal_value = q;
      return q;
    }
    const base = this.rules.get(view);
    if (!credential) return this.unavailable(base, null, undefined, 'Configure the backend AI provider or connect an OpenAI key for this session.', 'OPENAI_KEY_REQUIRED');
    const state = this.client(credential), fingerprint = this.fingerprint(base, credential), previous = state.snapshots[view];
    const key = `${credential.namespace}:${view}:${fingerprint}`, failure = this.failures.get(key);
    if (!force && failure && Date.now() - failure.at < 15000) return this.unavailable(base, credential, previous, failure.message, failure.code, fingerprint);
    if (!force && !failure && previous?.llm?.inputHash === fingerprint) return { ...clone(previous), asOf: base.asOf,
      degraded: base.degraded, sourceError: base.sourceError, lastAttemptAt: base.lastAttemptAt,
      lastSuccessfulRefreshAt: base.lastSuccessfulRefreshAt };
    const pending = this.pending.get(key); if (pending) return clone(await pending);
    const work = (async () => {
      try {
        // Empty queues need no model call and never grow placeholder leads.
        const result = base.items.length ? await this.scorer(base, credential) : { rows: [], model: credential.model, responseId: '' };
        if (this.fingerprint(this.rules.get(view), credential) !== fingerprint) throw new AppError('Lead evidence changed during the assessment. Refresh to assess the latest facts.', 409, 'ASSESSMENT_OUTDATED');
        const evaluatedAt = new Date().toISOString();
        let rows: QueueRow[] = base.items.map(row => {
          const assessed = result.rows.find(r => r.id === row.id);
          if (!assessed) throw new Error('The AI provider omitted a lead from the queue');
          return { ...clone(row), score: assessed.score, priorityStatus: assessed.priorityStatus, components: [],
            assessment: { model: result.model, responseId: result.responseId, evaluatedAt, reason: assessed.reason,
              urgencyReasons: assessed.urgencyReasons, confidenceReasons: assessed.confidenceReasons, evidenceIds: assessed.evidenceIds },
            rankingConfidence: { method: 'llm_assessment', reason: assessed.confidenceReason, score: assessed.confidence,
              retainedScenarios: null, scenarioCount: 0, minRank: null, maxRank: null, actionScore: null,
              verifyNext: assessed.verifyNext, insufficientEvidenceReason: assessed.confidence === null ? assessed.confidenceReason : null, scenarios: [] } };
        });
        rows.sort((a, b) => tier(a) - tier(b) || b.score - a.score || Date.parse(a.deadline || '9999-12-31') - Date.parse(b.deadline || '9999-12-31') || a.id.localeCompare(b.id));
        let actionable = 0;
        const changes: AuditEntry['changes'] = [];
        rows = rows.map((row, index) => {
          if (tier(row) === 0) actionable++;
          const prior = previous?.items.find(r => r.id === row.id);
          const band: Band = row.status === 'Blocked' ? 'BLOCKED' : row.status === 'Monitor' ? 'WAITING' : actionable <= 5 ? 'WORK_NOW' : 'NEXT';
          row.rank = index + 1; row.priorityBand = band; row.previousRank = prior?.rank ?? null;
          row.movement = prior ? prior.rank - row.rank : 'NEW'; row.previousDecision = prior ? toDecision(prior) : null;
          row.changedFact = row.changedFact || 'AI assessed the current cited lead evidence.';
          if (!prior || JSON.stringify(toDecision(prior)) !== JSON.stringify(toDecision(row))) changes.push({ id: row.id, before: row.previousDecision, after: toDecision(row) });
          return row;
        });
        const q: QueueSnapshot = { ...base, items: rows, queueVersion: hash({ fingerprint, rows: rows.map(r => ({ id: r.id, score: r.score,
          priority: r.priorityStatus, confidence: r.rankingConfidence.score, reason: r.assessment })) }),
          rubricVersion: RANKING_PROMPT_VERSION, scenarioVersion: 'llm-confidence-estimate',
          llm: { mode: 'llm', status: 'ready', model: result.model, evaluatedAt, attemptedAt: evaluatedAt,
            inputHash: fingerprint, promptVersion: RANKING_PROMPT_VERSION, responseId: result.responseId || null, error: null, code: null } };
        state.snapshots[view] = q;
        if (view === 'crm_plus_public' && changes.length) state.history.push({ eventId: `llm-${fingerprint.slice(0, 16)}`, eventType: 'AIAssessment',
          fact: `${credential.provider ?? 'OpenAI'} reassessed the current lead evidence.`, at: evaluatedAt, changes });
        state.history = state.history.slice(-30); this.persist(credential, state); this.failures.delete(key);
        return clone(q);
      } catch (error) {
        const known = error instanceof AppError;
        const message = known ? error.message : 'The AI provider returned an incomplete or unsupported assessment. The previous assessment was preserved.';
        const code = known ? error.code : 'OPENAI_INVALID_ASSESSMENT';
        this.failures.set(key, { at: Date.now(), message, code });
        return this.unavailable(base, credential, previous, message, code, fingerprint);
      }
    })();
    this.pending.set(key, work);
    try { return clone(await work); } finally { this.pending.delete(key); }
  }
  async comparison(credential: OpenAiCredential | null) {
    const [full, crm, value] = await Promise.all([this.get('crm_plus_public', credential), this.get('crm_only', credential), this.get('deal_value', credential)]);
    const baseline = this.rules.comparison();
    const summary = (q: QueueSnapshot) => ({ topFive: q.items.slice(0, 5).map(r => r.id),
      pursueInTopFive: q.items.slice(0, 5).filter(r => r.status === 'Pursue').length,
      verifyOrResolveInTopFive: q.items.slice(0, 5).filter(r => ['Verify', 'Resolve'].includes(r.status)).length });
    return { ...baseline, summaries: { crm_plus_public: summary(full), crm_only: summary(crm), deal_value: summary(value) },
      rows: full.items.map(r => { const c = crm.items.find(x => x.id === r.id)!, v = value.items.find(x => x.id === r.id)!;
        return { id: r.id, publicRank: r.rank, crmRank: c.rank, valueRank: v.rank, publicScore: r.score, crmScore: c.score,
          addedPoints: r.score - c.score, evidenceIds: r.evidence.filter(e => e.origin === 'public').map(e => e.id) }; }),
      note: 'AI queue comparisons use separate model assessments of the same seeded candidates. Source-family ablations below remain rules-baseline diagnostics; neither is a measured sales uplift.' };
  }
}
