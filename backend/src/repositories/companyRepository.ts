import { FilterQuery, Types } from 'mongoose';
import { Company, ICompanyDocument } from '../models/Company';
import { IntelligenceSignal } from '../models/IntelligenceSignal';

export interface CompanyFilters {
  country?: string;
  industry?: string;
  companyStage?: string;
  search?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export async function findCompanies(
  filters: CompanyFilters,
  pagination: PaginationOptions
): Promise<{ companies: ICompanyDocument[]; total: number }> {
  const query: FilterQuery<ICompanyDocument> = {};

  if (filters.country)      query.country      = filters.country;
  if (filters.industry)     query.industry     = filters.industry;
  if (filters.companyStage) query.companyStage = filters.companyStage;

  if (filters.search) {
    query.$text = { $search: filters.search };
  }

  const skip = (pagination.page - 1) * pagination.limit;

  const [companies, total] = await Promise.all([
    Company.find(query).skip(skip).limit(pagination.limit).sort({ createdAt: -1 }).lean(),
    Company.countDocuments(query),
  ]);

  return { companies: companies as unknown as ICompanyDocument[], total };
}

export async function findCompanyWithSignals(id: string): Promise<{
  company: ICompanyDocument | null;
  signals: unknown[];
}> {
  if (!Types.ObjectId.isValid(id)) return { company: null, signals: [] };

  const [company, signals] = await Promise.all([
    Company.findById(id).lean(),
    IntelligenceSignal.find({ companyId: new Types.ObjectId(id) })
      .sort({ detectedAt: -1 })
      .lean(),
  ]);

  return {
    company: company as unknown as ICompanyDocument | null,
    signals,
  };
}
