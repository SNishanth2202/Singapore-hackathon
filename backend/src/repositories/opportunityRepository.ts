import { FilterQuery, Types } from 'mongoose';
import { Opportunity, IOpportunityDocument } from '../models/Opportunity';

export interface OpportunityFilters {
  status?: string;
  priority?: string;
  companyId?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

/** Keep populated Mongo references out of the API's scalar company identity fields. */
export function serializeOpportunity(row: Record<string, any>) {
  const reference = row.companyId;
  const company = reference && typeof reference === 'object' && 'companyName' in reference ? reference : null;
  return {
    ...row,
    _id: String(row._id),
    companyId: String(company?._id ?? reference ?? ''),
    companyName: row.companyName ?? company?.companyName,
    salesCompanyId: row.salesCompanyId ?? company?.salesCompanyId,
    country: row.country ?? company?.country,
    industry: row.industry ?? company?.industry,
  };
}

export async function findOpportunities(
  filters: OpportunityFilters,
  pagination: PaginationOptions
): Promise<{ opportunities: IOpportunityDocument[]; total: number }> {
  const query: FilterQuery<IOpportunityDocument> = {};

  if (filters.status)   query.status   = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (filters.companyId && Types.ObjectId.isValid(filters.companyId)) {
    query.companyId = new Types.ObjectId(filters.companyId);
  }

  const skip = (pagination.page - 1) * pagination.limit;

  const [opportunities, total] = await Promise.all([
    Opportunity.find(query)
      .populate('companyId', 'companyName country industry salesCompanyId')
      .skip(skip)
      .limit(pagination.limit)
      .sort({ priority: 1, createdAt: -1 })
      .lean(),
    Opportunity.countDocuments(query),
  ]);

  return { opportunities: opportunities.map(serializeOpportunity) as unknown as IOpportunityDocument[], total };
}
