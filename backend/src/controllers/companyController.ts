import { Request, Response, NextFunction } from 'express';
import { findCompanies, findCompanyWithSignals } from '../repositories/companyRepository';
import { sendSuccess, buildPaginationMeta } from '../utils/apiResponse';
import { NotFoundError } from '../utils/errors';
import { CompanyQuery } from '../validators/company.validator';

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
    const { company, signals } = await findCompanyWithSignals(id);

    if (!company) {
      throw new NotFoundError('Company');
    }

    sendSuccess(res, { ...company, signals });
  } catch (err) {
    next(err);
  }
}
