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
      .populate('companyId', 'companyName country industry')
      .skip(skip)
      .limit(pagination.limit)
      .sort({ priority: 1, createdAt: -1 })
      .lean(),
    Opportunity.countDocuments(query),
  ]);

  return { opportunities: opportunities as unknown as IOpportunityDocument[], total };
}

export async function createOpportunity(
  data: Partial<IOpportunityDocument>
): Promise<IOpportunityDocument> {
  const opportunity = new Opportunity(data);
  return opportunity.save();
}

export async function countOpenOpportunities(): Promise<number> {
  return Opportunity.countDocuments({ status: 'OPEN' });
}

export async function countHighPriorityOpportunities(): Promise<number> {
  return Opportunity.countDocuments({ priority: 'HIGH', status: { $ne: 'CLOSED' } });
}
