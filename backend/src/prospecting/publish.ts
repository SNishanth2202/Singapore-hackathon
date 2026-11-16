import { Lead } from './contracts';
import { recordDiscoveryHandoff, DiscoveryCandidate } from '../sales/workflow';

/** Share validated research with the sales worklist and dashboard. This records
 * an evidence-supported hypothesis, never a confirmed customer requirement. */
export async function publishProspect(lead: Lead, handoff = recordDiscoveryHandoff): Promise<void> {
  if (lead.fitStatus !== 'SUPPORTED' || lead.analysisOrigin !== 'model') return;
  const sourceIds = new Set(lead.sources.map(source => source.id));
  const candidates = [...new Map((lead.analysis.possibleNeeds ?? [])
    .filter((need: any) => need.offeringId && need.evidenceIds?.length && need.evidenceIds.every((id: string) => sourceIds.has(id)))
    .map((need: any) => [need.offeringId, { opportunityId: `${lead.researchId}:${need.offeringId}`, service: need.serviceName ?? need.offeringId,
      offeringId: need.offeringId, sourceIds: [...new Set(need.evidenceIds)] as string[], reason: need.reason, question: need.validationQuestion }])).values()] as DiscoveryCandidate[];
  if (!candidates.length) return;
  await handoff({ companyId: `entity:${lead.id}`, companyName: lead.name, researchId: lead.researchId,
    sourceIds: [...sourceIds], evidence: lead.sources.map(source => ({ sourceId: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt })), candidates });
}
