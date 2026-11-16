import { Request, Response, NextFunction } from 'express';
import { findCompanies, findCompanyWithSignals } from '../repositories/companyRepository';
import { sendSuccess, buildPaginationMeta } from '../utils/apiResponse';
import { NotFoundError } from '../utils/errors';
import { CompanyQuery } from '../validators/company.validator';
import { findOpportunities } from '../repositories/opportunityRepository';

export async function listCompanies(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = req.query as unknown as CompanyQuery;
    const { companies, total } = await findCompanies(
      {
        country:      q.country,
        industry:     q.industry,
        companyStage: q.stage,
        search:       q.search,
      },
      { page: q.page, limit: q.limit }
    );

    const meta = buildPaginationMeta(q.page, q.limit, total);
    sendSuccess(res, companies, 200, undefined, meta);
  } catch (err) {
    next(err);
  }
}

export async function getCompany(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const [{ company, signals }, { opportunities }] = await Promise.all([
      findCompanyWithSignals(id),
      findOpportunities({ companyId: id }, { page: 1, limit: 100 }),
    ]);

    if (!company) {
      throw new NotFoundError('Company');
    }

    sendSuccess(res, { ...company, signals, opportunities });
  } catch (err) {
    next(err);
  }
}
