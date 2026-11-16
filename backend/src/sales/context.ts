import { AppError } from '../utils/errors';
import { loadResearch, validResearchId, ResearchRecord } from '../integrations/research/store';
import { findCompanyActivities, allActivityEvents } from '../salesStore';
import { SalesCompanyContext } from './workflow';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { SalesActivity, ISalesActivity } from '../models/SalesActivity';
import { requireCloudMongo } from '../models/CloudStorage';
import { Types } from 'mongoose';
import { demoCompanies } from '../demo/companies';

interface CompanyBinding {
  companyName: string; salesCompanyId?: string; country?: string; industry?: string;
  website?: string; description?: string; isSynthetic?: boolean;
}
export interface SalesContextRepository {
  findCompanyBinding(key: string): Promise<CompanyBinding | null>;
  findResearchActivity(researchId: string): Promise<ISalesActivity | null>;
  findCompanyActivities(companyId: string): Promise<ISalesActivity[]>;
  loadResearch(researchId: string): Promise<ResearchRecord>;
}

const repository: SalesContextRepository = {
  async findCompanyBinding(key) {
    if (env.STORAGE_MODE === 'memory') {
      const profiles = demoCompanies as unknown as (CompanyBinding & { _id: string })[];
      return profiles.find(company => company._id === key || company.salesCompanyId === key) ?? null;
    }
    requireCloudMongo();
    const filter = Types.ObjectId.isValid(key) ? { _id: new Types.ObjectId(key) } : { salesCompanyId: key };
    return await Company.findOne(filter).select('companyName salesCompanyId country industry website description isSynthetic').lean() as CompanyBinding | null;
  },
  async findResearchActivity(researchId) {
    if (env.STORAGE_MODE === 'memory') {
      const events = (await allActivityEvents()).filter(event => event.researchId === researchId)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      return events.find(event => event.type === 'DISCOVERED') ?? events[0] ?? null;
    }
    requireCloudMongo();
    return await SalesActivity.findOne({ researchId, type: 'DISCOVERED' }).sort({ createdAt: 1 }).lean() as ISalesActivity | null
      ?? await SalesActivity.findOne({ researchId }).sort({ createdAt: 1 }).lean() as ISalesActivity | null;
  },
  findCompanyActivities, loadResearch,
};

/** Profile, research and sales routes address one stored timeline.
 * Use explicit profile bindings or recorded activity, never a company-name match.
 */
export function createSalesContextResolver(store: SalesContextRepository) {
  return async (key: string): Promise<SalesCompanyContext> => {
    const requestedResearch = validResearchId(key) ? await store.loadResearch(key) : null;
    const recordedIdentity = requestedResearch ? await store.findResearchActivity(requestedResearch.id) : null;
    const identityKey = requestedResearch ? recordedIdentity?.companyId ?? 'entity:' + requestedResearch.company.entityId : key;
    const profile = await store.findCompanyBinding(identityKey);
    const companyId = profile?.salesCompanyId ?? identityKey;
    const events = await store.findCompanyActivities(companyId);
    const first = events[0] ?? recordedIdentity;
    if (!first && !requestedResearch) throw new AppError('Company is not in the sales workflow.', 404, 'WORKFLOW_COMPANY_NOT_FOUND');
    const latestDiscovery = [...events].reverse().find(event => event.type === 'DISCOVERED' && validResearchId(event.researchId ?? ''));
    const researchId = requestedResearch?.id ?? latestDiscovery?.researchId ?? first?.researchId;
    const record = requestedResearch ?? (researchId && validResearchId(researchId) ? await store.loadResearch(researchId).catch(() => null) : null);
    return { companyId, companyName: record?.company.name ?? profile?.companyName ?? first!.companyName, researchId,
      country: profile?.country ?? latestDiscovery?.country ?? first?.country,
      industry: profile?.industry ?? latestDiscovery?.industry ?? first?.industry,
      website: record?.company.website ?? profile?.website,
      description: record?.company.description ?? profile?.description,
      service: [...events].reverse().find(event => event.type === 'QUALIFIED')?.service,
      sourceIds: record?.sources.map(source => source.id) ?? first?.sourceIds ?? [],
      evidence: record?.sources.map(source => ({ sourceId: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt,
        excerpt: source.excerpt, kind: source.kind, verification: source.verification })),
      // Preserve the conservative safety flag across all identifiers and events.
      isSynthetic: profile?.isSynthetic === true || recordedIdentity?.isSynthetic === true || events.some(event => event.isSynthetic)
        || companyId.startsWith('synthetic:') };
  };
}

export const resolveSalesContext = createSalesContextResolver(repository);
