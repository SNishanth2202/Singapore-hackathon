import fs from 'fs';
import path from 'path';
import { AuditEntry, DemoState, EventSchema, OpportunitySchema, QueueSnapshot, ReplayEvent, SourceRecord, VIEWS, View, clone, DAY, T0 } from './contracts';
import { priorityStatusFor, rankQueue, toDecision } from './engine';
import { fetchGebiz, hash, importSources, sourceEvidence, matchEntity } from './importer';
import { fixtureCrm, fixtureOpportunities, makeSeed, REPO_ROOT } from './seed';

export class DomainError extends Error { constructor(message: string, public status = 400) { super(message); } }
export class RankingService {
  private state: DemoState;
  private serial: Promise<unknown> = Promise.resolve();
  constructor(private storePath: string | null = path.join(REPO_ROOT, '.local/lead-ranking-state.json'), seedFactory: () => DemoState = makeSeed) {
    if (storePath && fs.existsSync(storePath)) {
      const saved = JSON.parse(fs.readFileSync(storePath, 'utf8')) as DemoState;
      if (saved.schemaVersion !== 1 || !Array.isArray(saved.evidence) || !saved.snapshots) throw new Error('Invalid local ranking state; restore a valid file or run seed:lead-ranking');
      saved.opportunities = saved.opportunities.map(o => OpportunitySchema.parse(o));
      this.state = saved;
      // Upgrade saved displays without resetting events, movement or source health.
      let upgraded = false;
      const upgrade = (decision: { score: number; priorityStatus?: string } | null) => {
        if (decision && !decision.priorityStatus) { decision.priorityStatus = priorityStatusFor(decision.score); upgraded = true; }
      };
      for (const snapshot of Object.values(saved.snapshots)) for (const row of snapshot.items) {
        upgrade(row); upgrade(row.previousDecision);
      }
      for (const entry of saved.history) for (const change of entry.changes) { upgrade(change.before); upgrade(change.after); }
      if (upgraded) this.persist(saved);
    } else {
      try { this.state = seedFactory(); }
      catch (err) {
        this.state = { schemaVersion: 1, runId: 'uninitialized', asOf: T0, opportunities: [], sources: [], evidence: [],
          versions: {}, appliedEvents: {}, history: [], snapshots: {} as DemoState['snapshots'], initialized: false,
          sourceError: `Initialization failed: ${(err as Error).message}`, lastAttemptAt: new Date().toISOString(), lastSuccessfulRefreshAt: null };
      }
      this.publish(this.state, 'Initial dated snapshot seed');
      if (this.state.initialized) this.persist(this.state);
    }
  }
  private persist(state: DemoState) {
    if (!this.storePath) return;
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    const tmp = `${this.storePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2)); fs.renameSync(tmp, this.storePath);
  }
  private transaction<T>(work: () => Promise<T> | T): Promise<T> {
    const result = this.serial.then(work); this.serial = result.catch(() => undefined); return result;
  }
  private publish(state: DemoState, fact: string): AuditEntry['changes'] {
    const changes: AuditEntry['changes'] = [];
    for (const view of VIEWS) {
      const old = state.snapshots[view];
      const items = rankQueue(state.opportunities, state.evidence, state.asOf, view);
      const signature = hash(items.map(r => ({ id: r.id, rank: r.rank, score: r.score, status: r.status,
        action: r.actionCode, band: r.priorityBand, confidence: r.rankingConfidence,
        gates: r.gates, components: r.components, evidence: r.evidence, deadline: r.deadline })));
      if (old?.queueVersion === signature) continue;
      for (const row of items) {
        const prior = old?.items.find(r => r.id === row.id);
        row.previousRank = prior?.rank ?? null; row.movement = prior ? prior.rank - row.rank : 'NEW';
        row.previousDecision = prior ? toDecision(prior) : null;
        const changed = !prior || JSON.stringify(toDecision(prior)) !== JSON.stringify(toDecision(row));
        row.changedFact = changed ? fact : prior?.changedFact ?? null;
        if (view === 'crm_plus_public' && changed) changes.push({ id: row.id, before: row.previousDecision, after: toDecision(row) });
      }
      state.snapshots[view] = { items, total: items.length, view, queueVersion: signature, queueComputedAt: state.asOf,
        asOf: state.asOf, eventCursor: Object.keys(state.appliedEvents).length, initialized: state.initialized, degraded: false,
        lastSuccessfulRefreshAt: state.lastSuccessfulRefreshAt, lastAttemptAt: state.lastAttemptAt, sourceError: null,
        rubricVersion: 'rubric-v1', scenarioVersion: 'scenario-v1', fixtureVersion: 'singtel-demo-v1' };
    }
    return changes;
  }
  get(view: View = 'crm_plus_public'): QueueSnapshot {
    return { ...clone(this.state.snapshots[view]), asOf: this.state.asOf, degraded: !!this.state.sourceError,
      sourceError: this.state.sourceError, lastAttemptAt: this.state.lastAttemptAt, lastSuccessfulRefreshAt: this.state.lastSuccessfulRefreshAt };
  }
  inspect(): DemoState { return clone(this.state); }
  reset(empty = false) {
    return this.transaction(() => {
      const state = makeSeed(empty); this.publish(state, empty ? 'Empty demo reset' : 'Initial dated snapshot seed');
      this.persist(state); this.state = state; return this.get();
    });
  }
  apply(raw: unknown): Promise<QueueSnapshot> {
    return this.transaction(() => {
      const event = EventSchema.parse(raw), payloadHash = hash(event), previousHash = this.state.appliedEvents[event.eventId];
      if (previousHash) { if (payloadHash !== previousHash) throw new DomainError('Event ID reused with a different payload', 409); return this.get(); }
      const expected = (this.state.versions[event.aggregateId] || 0) + 1;
      if (event.aggregateVersion !== expected) throw new DomainError(`Expected aggregate version ${expected}; received ${event.aggregateVersion}`, 409);
      const next = clone(this.state);
      let o = next.opportunities.find(r => r.id === event.aggregateId);
      if (event.eventType === 'PublicTriggerImported') {
        if (!event.payload.sourceIds?.length || event.payload.sourceIds.some(id => !next.sources.some(s => s.id === id))) throw new DomainError('Public trigger requires cited source IDs');
        if (event.aggregateId !== 'O01' || !event.payload.sourceIds.includes('S01') || !event.payload.sourceIds.includes('S02')) throw new DomainError('Demo trigger requires the reviewed ETLA subsidiary and facility records');
        if (!o) {
          o = fixtureOpportunities().find(r => r.id === 'O01')!;
          const subsidiary = next.sources.find(s => s.id === 'S01')?.claims.subsidiary;
          const match = matchEntity(String(subsidiary || ''), fixtureCrm.accounts);
          if (match.status !== 'verified' || match.candidates[0] !== o.accountId) {
            o.matchStatus = 'ambiguous'; o.matchCandidates = match.candidates;
          } else {
            for (const source of next.sources.filter(s => event.payload.sourceIds!.includes(s.id))) {
              source.matchStatus = 'verified'; source.matchedEntityId = o.accountId; source.matchedSiteId = o.siteId;
            }
          }
          o.evidenceIds.push('crm-need-review-O01', 'crm-need-O01'); next.opportunities.push(o);
        }
      } else {
        if (!o) throw new DomainError('Opportunity not found', 404);
        this.reduce(o, event, next);
      }
      next.versions[event.aggregateId] = event.aggregateVersion; next.appliedEvents[event.eventId] = payloadHash;
      const fact = event.description || `${event.eventType} for ${event.aggregateId}`;
      const changes = this.publish(next, fact);
      next.history.push({ eventId: event.eventId, eventType: event.eventType, fact, at: next.asOf, changes });
      this.persist(next); this.state = next; return this.get();
    });
  }
  private reduce(o: DemoState['opportunities'][number], e: ReplayEvent, state: DemoState) {
    const addEvidence = (id: string, title: string, excerpt: string, engineering = false) => {
      state.evidence = state.evidence.filter(record => record.id !== id);
      state.evidence.push({ id, title, excerpt, origin: engineering ? 'mock_engineering' : 'mock_salesforce',
        date: state.asOf, url: null, locator: `Synthetic replay event ${e.eventId}`, claimStatus: 'synthetic',
        entity: o.account, site: o.address, sourceFamily: engineering ? 'mock_engineering' : 'mock_salesforce' });
    };
    switch (e.eventType) {
      case 'BuyingWindowConfirmed': case 'RenewalNoticeConfirmed':
        if (!e.payload.deadline) throw new DomainError('A confirmed window requires an exact deadline');
        o.deadline = e.payload.deadline; o.windowConfirmed = true; o.recentActivityAt = state.asOf;
        addEvidence(`crm-window-${o.id}`, 'Mock Salesforce · confirmed buying window', `Buyer confirmed required notice ${o.deadline}; mock event ${e.eventId}.`);
        addEvidence(`crm-buyer-${o.id}`, 'Mock Salesforce · buyer activity', 'Synthetic buyer confirmation recorded at the frozen demo clock.'); break;
      case 'SiteAssessmentCompleted':
        if (!e.payload.state) throw new DomainError('Site assessment state is required');
        o.siteState = e.payload.state; o.siteAssessedAt = state.asOf; o.siteUncertain = o.id === 'O01' && e.payload.state === 'UNKNOWN'; o.unbounded = false;
        addEvidence(o.siteEvidenceId, 'Mock engineering · completed site assessment', `${o.siteState}: exact premises ${o.address}; service deliverable by ${o.readyBy}.`, true); break;
      case 'TechnicalAssessmentCompleted':
        if (!e.payload.state) throw new DomainError('Technical assessment state is required');
        o.technicalState = e.payload.state; o.technicalAssessedAt = state.asOf;
        if (e.payload.latencyMs !== undefined) o.latencyMs = e.payload.latencyMs;
        if (e.payload.diversePaths !== undefined) o.diversePaths = e.payload.diversePaths;
        if (o.technicalState === 'UNKNOWN') { o.latencyMs = null; o.diversePaths = null; }
        if (o.product === 'Private 5G' && o.technicalState !== 'UNKNOWN' && o.latencyMs === null) throw new DomainError('A private 5G decision needs a measured latency value');
        if (o.product !== 'Private 5G' && o.technicalState !== 'UNKNOWN' && o.diversePaths === null) throw new DomainError('A route decision needs a measured diverse-path count');
        if (o.technicalState !== 'UNKNOWN') {
          const measuredPass = o.product === 'Private 5G' ? o.latencyMs! <= 20 : o.diversePaths! >= 2;
          if ((o.technicalState === 'PASS') !== measuredPass) throw new DomainError('Technical state conflicts with the measured mandatory requirement');
        }
        addEvidence(o.technicalEvidenceId, 'Mock engineering · completed technical assessment', `${o.technicalState}: ${o.product === 'Private 5G' ? `${o.latencyMs}ms p95 latency; requirement <=20ms` : `${o.diversePaths} diverse paths; requirement >=2`}.`, true); break;
      case 'ServiceCaseOpened':
        o.caseOpen = true; o.caseDueAt = new Date(Date.parse(state.asOf) + DAY).toISOString();
        addEvidence(`crm-case-${o.id}`, 'Mock Salesforce · open service case', `Synthetic service case opened at ${o.address}; SLA due ${o.caseDueAt}.`);
        if (!o.evidenceIds.includes(`crm-case-${o.id}`)) o.evidenceIds.push(`crm-case-${o.id}`); break;
      case 'ServiceCaseResolved':
        o.caseOpen = false; o.caseDueAt = null;
        addEvidence(`crm-case-${o.id}`, 'Mock Salesforce · resolved service case', 'Synthetic service case resolved; renewal pursuit can resume after gates pass.'); break;
      case 'AmbiguousMatchDetected': o.matchStatus = 'ambiguous'; o.matchCandidates = e.payload.candidates || ['ACC-1', 'unresolved-alias']; break;
      case 'MatchVerified': o.matchStatus = 'verified'; o.matchCandidates = []; break;
      case 'AssumptionBoundsRemoved': o.unbounded = true; break;
      default: throw new DomainError('Unsupported reducer event');
    }
  }
  advance(asOf: string) {
    return this.transaction(() => {
      if (!Number.isFinite(Date.parse(asOf)) || Date.parse(asOf) < Date.parse(this.state.asOf)) throw new DomainError('Clock must be a valid timestamp and cannot move backwards');
      const next = clone(this.state); next.asOf = new Date(asOf).toISOString();
      const changes = this.publish(next, `Clock crossed a decision threshold at ${next.asOf}`);
      if (changes.length) next.history.push({ eventId: `clock-${next.asOf}`, eventType: 'ClockAdvanced', fact: 'Deadline, freshness or activity threshold crossed', at: next.asOf, changes });
      this.persist(next); this.state = next; return this.get();
    });
  }
  refresh(fail = false, connector: () => Promise<SourceRecord[]> = fetchGebiz) {
    return this.transaction(async () => {
      const next = clone(this.state); next.lastAttemptAt = new Date().toISOString();
      try {
        if (fail) throw new Error('Demonstration: GeBIZ connector timed out');
        const imported = importSources(next.sources, await connector());
        next.sources = imported.records; next.sourceError = null; next.lastSuccessfulRefreshAt = next.lastAttemptAt;
        const publicEvidence = next.sources.map(sourceEvidence);
        next.evidence = [...next.evidence.filter(e => e.origin !== 'public'), ...publicEvidence];
        this.publish(next, 'Verified live public-source refresh');
      } catch (err) { next.sourceError = (err as Error).message; }
      this.persist(next); this.state = next; return this.get();
    });
  }
  comparison() {
    const full = this.get(), crm = this.get('crm_only'), value = this.get('deal_value');
    const summary = (q: QueueSnapshot) => ({ topFive: q.items.slice(0, 5).map(r => r.id),
      pursueInTopFive: q.items.slice(0, 5).filter(r => r.status === 'Pursue').length,
      verifyOrResolveInTopFive: q.items.slice(0, 5).filter(r => ['Verify', 'Resolve'].includes(r.status)).length });
    const families = [...new Set(this.state.sources.map(s => s.sourceFamily))];
    return { asOf: this.state.asOf, eventCursor: full.eventCursor, universe: full.items.map(r => r.id).sort(),
      summaries: { crm_plus_public: summary(full), crm_only: summary(crm), deal_value: summary(value) },
      rows: full.items.map(r => { const c = crm.items.find(x => x.id === r.id)!, v = value.items.find(x => x.id === r.id)!;
        return { id: r.id, publicRank: r.rank, crmRank: c.rank, valueRank: v.rank, publicScore: r.score, crmScore: c.score,
          addedPoints: r.score - c.score, evidenceIds: r.evidenceIds.filter(id => this.state.evidence.find(e => e.id === id)?.origin === 'public') }; }),
      ablations: families.map(family => {
        const groups = new Set(this.state.sources.filter(s => s.sourceFamily === family).map(s => s.provenanceGroupId || s.id));
        const removed = new Set(this.state.sources.filter(s => groups.has(s.provenanceGroupId || s.id)).map(s => s.id));
        const candidates = clone(this.state.opportunities).map(o => ({ ...o,
          need: (o.needOrigin === 'public' && o.needEvidenceIds.some(id => removed.has(id)) ? 0 : o.need) as 0 | 8 | 15,
          catalogAvailable: !removed.has(o.product === 'Private 5G' ? 'S10' : 'S09') }));
        const rows = rankQueue(candidates, this.state.evidence, this.state.asOf);
        return { family, removedProvenanceGroups: [...groups], topFive: rows.slice(0, 5).map(r => r.id), changedRows: rows.filter(r => full.items.find(x => x.id === r.id)?.rank !== r.rank).map(r => r.id) };
      }), note: 'Fixture diagnostics only. Same candidates, clock and event cursor; no measured sales lift.' };
  }
}
