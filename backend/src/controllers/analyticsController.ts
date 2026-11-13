import { Request, Response, NextFunction } from 'express';
import { Company } from '../models/Company';
import {
  countCompaniesByCountry,
  countCompaniesByIndustry,
  countNewCompaniesThisWeek,
} from '../repositories/companyRepository';
import {
  countOpenOpportunities,
  countHighPriorityOpportunities,
} from '../repositories/opportunityRepository';
import { sendSuccess } from '../utils/apiResponse';

export async function getOverview(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [
      totalCompanies,
      newThisWeek,
      openOpportunities,
      highPriorityOpportunities,
      companiesByCountry,
      companiesByIndustry,
    ] = await Promise.all([
      Company.countDocuments(),
      countNewCompaniesThisWeek(),
      countOpenOpportunities(),
      countHighPriorityOpportunities(),
      countCompaniesByCountry(),
      countCompaniesByIndustry(),
    ]);

    sendSuccess(res, {
      totalCompanies,
      newThisWeek,
      openOpportunities,
      highPriorityOpportunities,
      companiesByCountry: companiesByCountry.map((r) => ({
        country: r._id,
        count:   r.count,
      })),
      companiesByIndustry: companiesByIndustry.map((r) => ({
        industry: r._id,
        count:    r.count,
      })),
    });
  } catch (err) {
    next(err);
  }
}
