import { Router } from 'express';
import { demoCompanies } from './companies';

const router = Router();
router.get('/companies', (req, res) => {
  const search = String(req.query.search ?? '').toLowerCase();
  const data = demoCompanies.filter((c) => (!search || c.companyName.toLowerCase().includes(search)) &&
    (!req.query.country || c.country === req.query.country) && (!req.query.industry || c.industry === req.query.industry));
  res.json({ success: true, data, dataMode: 'sample', meta: { total: data.length, page: 1, limit: 25, totalPages: 1 } });
});
router.get('/companies/:id', (req, res) => {
  const company = demoCompanies.find((c) => c._id === req.params.id);
  if (!company) { res.status(404).json({ success: false, message: 'Company not found', code: 'NOT_FOUND' }); return; }
  res.json({ success: true, data: company });
});
export default router;
