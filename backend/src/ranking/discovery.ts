import { createHash } from 'node:crypto';
import { businessKnowledgeStore } from '../business/store';
import { identifySeller, matchOfferings } from '../business/matching';
import { buildResearchOverview } from '../integrations/research/events';
import { researchEvidence } from '../integrations/research/grounding';
import { loadResearch } from '../integrations/research/store';
import type { Evidence, Opportunity, SourceRecord } from './contracts';

export class DiscoveryHandoffError extends Error {}

export interface DiscoveryHandoff {
  researchId: string;
  company: { entityId: string; name: string };
  opportunities: Opportunity[];
  sources: SourceRecord[];
  fact: string;
}

const stableId = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const asIso = (value: string | null | undefined, fallback: string) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};

/**
 * Converts only evidence-qualified Discovery matches into ranking candidates.
 * It deliberately supplies no CRM owner, site, deadline, or commercial facts.
 */
export async function prepareDiscoveryHandoff(researchId: string): Promise<DiscoveryHandoff> {
  const [record, knowledge] = await Promise.all([loadResearch(researchId), businessKnowledgeStore.read()]);
  if (identifySeller(record.company, knowledge).isSeller) {
    throw new DiscoveryHandoffError('The configured seller cannot be added to the customer lead worklist.');
  }
  const overview = buildResearchOverview(record);
  const candidates = matchOfferings(knowledge, researchEvidence(record, overview));
  if (!candidates.length) {
    throw new DiscoveryHandoffError('No evidence-qualified service hypothesis is available to rank. Collect a dated, relevant company event first.');
  }
  const sourceIds = new Set(candidates.flatMap(candidate => candidate.evidenceIds));
  const sourceById = new Map(record.sources.map(source => [source.id, source]));
  const now = new Date().toISOString();
  const sourceIdFor = (sourceId: string) => `discovery:${record.id}:${sourceId}`;
  const sources: SourceRecord[] = [...sourceIds].flatMap(sourceId => {
    const source = sourceById.get(sourceId);
    if (!source) return [];
    return [{
      schemaVersion: 1 as const,
      id: sourceIdFor(source.id), sourceFamily: 'discovery_snapshot', sourceUrl: source.url,
      locator: `Research snapshot ${record.id}; source ${source.id}`,
      publishedAt: source.publishedAt, effectiveAt: null, retrievedAt: source.retrievedAt,
      excerpt: source.excerpt, entityHints: [{ name: record.company.name, role: 'researched_company' }],
      matchedEntityId: record.company.entityId, matchedSiteId: null, matchStatus: 'verified' as const,
      claimStatus: 'observed' as const, origin: 'public' as const,
      claims: { researchId: record.id, researchSourceId: source.id, title: source.title, verification: source.verification },
      contentHash: source.contentHash, provenanceGroupId: `discovery:${record.company.entityId}:${source.id}`,
    }];
  });
  const offerings = new Map(knowledge.offerings.map(offering => [offering.id, offering]));
  const opportunities = candidates.map(candidate => {
    const offering = offerings.get(candidate.offeringId)!;
    const id = `DISC-${stableId(`${record.company.entityId}:${offering.id}`)}`;
    const evidenceIds = candidate.evidenceIds.map(sourceIdFor);
    const latest = candidate.evidenceIds
      .map(sourceId => sourceById.get(sourceId)?.publishedAt)
      .filter((date): date is string => !!date)
      .sort()
      .at(-1) ?? null;
    return {
      id, accountId: `DISC-${record.company.entityId}`, account: record.company.name, parent: 'Discovery research account',
      buyingUnitId: `DISC-BUYING-UNIT-${stableId(record.company.entityId)}`, buyingUnit: 'Unverified buying unit',
      siteId: `DISC-SITE-${stableId(record.company.entityId)}`, address: 'Exact service site not yet confirmed',
      product: offering.name, useCase: candidate.basis,
      buyingWindowId: `DISC-WINDOW-${stableId(record.company.entityId)}`, ownerId: 'DISCOVERY-TRIAGE', owner: 'Discovery triage queue',
      contactId: '', need: candidate.fitLevel === 'DIRECT_SIGNAL' ? 15 as const : 8 as const,
      needOrigin: 'public' as const, evidenceIds, needEvidenceIds: evidenceIds, catalogAvailable: true,
      deadline: null, deadlineKind: 'No purchasing window confirmed', windowConfirmed: false, deadlineAlternatives: [],
      readyBy: new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
      siteState: 'UNKNOWN' as const, technicalState: 'UNKNOWN' as const,
      siteAssessedAt: now, technicalAssessedAt: now,
      siteEvidenceId: `integration-site-${id}`, technicalEvidenceId: `integration-technical-${id}`,
      diversePaths: null, latencyMs: null, directFit: candidate.fitLevel === 'DIRECT_SIGNAL',
      recentActivityAt: latest ? asIso(latest, now) : null,
      annualContributionSgd: 0, annualDealValueSgd: 0, pursuitHours: 24, estimated: false,
      caseOpen: false, caseDueAt: null, matchStatus: 'ambiguous' as const, matchCandidates: [],
      unbounded: false, siteUncertain: true, hiddenUntilTrigger: false, isSynthetic: true as const,
    } satisfies Opportunity;
  });
  return { researchId: record.id, company: { entityId: record.company.entityId, name: record.company.name }, opportunities, sources,
    fact: `Discovery hand-off from ${record.id}: evidence-qualified service hypotheses require account, site, technical and deadline verification.` };
}

export function integrationEvidence(handoff: DiscoveryHandoff, asOf: string): Evidence[] {
  return handoff.opportunities.flatMap(opportunity => [
    { id: opportunity.siteEvidenceId, title: 'Integration gate · site confirmation pending', origin: 'mock_engineering' as const,
      date: asOf, excerpt: 'No exact service site was supplied by Discovery. Verify the premises before commercial pursuit.', url: null,
      locator: `Discovery hand-off ${handoff.researchId}`, claimStatus: 'synthetic', entity: opportunity.account, site: opportunity.address, sourceFamily: 'integration_gate' },
    { id: opportunity.technicalEvidenceId, title: 'Integration gate · technical assessment pending', origin: 'mock_engineering' as const,
      date: asOf, excerpt: 'No technical feasibility assessment was supplied by Discovery. Verify the implementation requirements.', url: null,
      locator: `Discovery hand-off ${handoff.researchId}`, claimStatus: 'synthetic', entity: opportunity.account, site: opportunity.address, sourceFamily: 'integration_gate' },
    { id: `crm-window-${opportunity.id}`, title: 'Integration gate · buying window pending', origin: 'mock_salesforce' as const,
      date: asOf, excerpt: 'No CRM buying window was supplied by Discovery. Confirm the purchase or bid deadline with the buyer.', url: null,
      locator: `Discovery hand-off ${handoff.researchId}`, claimStatus: 'synthetic', entity: opportunity.account, site: opportunity.address, sourceFamily: 'integration_gate' },
    { id: `crm-buyer-${opportunity.id}`, title: 'Integration gate · buying unit pending', origin: 'mock_salesforce' as const,
      date: asOf, excerpt: 'Discovery has not established a buyer or owner. Assign only after CRM validation.', url: null,
      locator: `Discovery hand-off ${handoff.researchId}`, claimStatus: 'synthetic', entity: opportunity.account, site: opportunity.address, sourceFamily: 'integration_gate' },
    { id: `crm-commercial-${opportunity.id}`, title: 'Integration gate · commercial value not assessed', origin: 'mock_salesforce' as const,
      date: asOf, excerpt: 'No commercial value was inferred from public signals.', url: null,
      locator: `Discovery hand-off ${handoff.researchId}`, claimStatus: 'synthetic', entity: opportunity.account, site: opportunity.address, sourceFamily: 'integration_gate' },
  ]);
}
