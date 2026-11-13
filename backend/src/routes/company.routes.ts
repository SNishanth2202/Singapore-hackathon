import { Router } from 'express';
import { listCompanies, getCompany } from '../controllers/companyController';
import { validate } from '../middleware/validate';
import { CompanyQuerySchema } from '../validators/company.validator';

const router = Router();

router.get('/',    validate(CompanyQuerySchema, 'query'), listCompanies);
router.get('/:id', getCompany);

export default router;
