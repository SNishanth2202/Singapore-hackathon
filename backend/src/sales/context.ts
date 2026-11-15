import { AppError } from '../utils/errors';
import { loadResearch, validResearchId } from '../integrations/research/store';
import { findCompanyActivities } from '../salesStore';
import { SalesCompanyContext } from './workflow';

/** Resolve the shared company context from a research snapshot ID or an immutable companyId (entity:Q…). */
export async function resolveSalesContext(key: string): Promise<SalesCompanyContext> {
  if (validResearchId(key)) {
    const record = await loadResearch(key);
    const canonicalId = `entity:${record.company.entityId}`;
    const events = await findCompanyActivities(canonicalId);
    const service = [...events].reverse().find(event => event.type === 'QUALIFIED')?.service;
    return { companyId: canonicalId, companyName: record.company.name, researchId: record.id, service,
      website: record.company.website, description: record.company.description,
      sourceIds: record.sources.map(source => source.id),
      evidence: record.sources.map(source => ({ sourceId: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt,
        excerpt: source.excerpt, kind: source.kind, verification: source.verification })) };
  }
  const events = await findCompanyActivities(key);
  const first = events[0];
  if (!first) throw new AppError('Company is not in the sales workflow.', 404, 'WORKFLOW_COMPANY_NOT_FOUND');
  const record = first.researchId && validResearchId(first.researchId) ? await loadResearch(first.researchId).catch(() => null) : null;
  return { companyId: key, companyName: first.companyName, researchId: first.researchId,
    country: first.country, industry: first.industry,
    website: record?.company.website, description: record?.company.description,
    service: [...events].reverse().find(event => event.type === 'QUALIFIED')?.service,
    sourceIds: record?.sources.map(source => source.id) ?? first.sourceIds,
    evidence: record?.sources.map(source => ({ sourceId: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt,
      excerpt: source.excerpt, kind: source.kind, verification: source.verification })),
    isSynthetic: first.isSynthetic };
}
