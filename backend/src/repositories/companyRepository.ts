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

export async function findCompanyById(
  id: string
): Promise<ICompanyDocument | null> {
  if (!Types.ObjectId.isValid(id)) return null;

  const company = await Company.findById(id).lean();
  return company as unknown as ICompanyDocument | null;
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

export async function createCompany(
  data: Partial<ICompanyDocument>
): Promise<ICompanyDocument> {
  const company = new Company(data);
  return company.save();
}

export async function updateCompanyNeo4jId(
  companyId: string,
  neo4jNodeId: string
): Promise<void> {
  await Company.findByIdAndUpdate(companyId, { neo4jNodeId });
}

export async function countCompaniesByCountry(): Promise<Array<{ _id: string; count: number }>> {
  return Company.aggregate([
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);
}

export async function countCompaniesByIndustry(): Promise<Array<{ _id: string; count: number }>> {
  return Company.aggregate([
    { $group: { _id: '$industry', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
}

export async function countNewCompaniesThisWeek(): Promise<number> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return Company.countDocuments({ createdAt: { $gte: oneWeekAgo } });
}
