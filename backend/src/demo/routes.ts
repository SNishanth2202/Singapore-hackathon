import { Router } from 'express';
import { demoCompanies, demoOpportunities } from './companies';

const router = Router();
router.get('/opportunities', (req, res) => {
  const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1);
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(req.query.limit)) || 25));
  const records = demoOpportunities.filter((row: any) => (!req.query.status || row.status === req.query.status)
    && (!req.query.priority || row.priority === req.query.priority));
  res.json({ success: true, data: records.slice((page - 1) * limit, page * limit), dataMode: 'sample',
    meta: { total: records.length, page, limit, totalPages: Math.ceil(records.length / limit) } });
});
router.get('/companies', (req, res) => {
  const search = String(req.query.search ?? '').toLowerCase();
  const data = demoCompanies.filter((c) => (!search || c.companyName.toLowerCase().includes(search)) &&
    (!req.query.country || c.country === req.query.country) && (!req.query.industry || c.industry === req.query.industry));
  res.json({ success: true, data, dataMode: 'sample', meta: { total: data.length, page: 1, limit: 25, totalPages: 1 } });
});
router.get('/companies/:id', (req, res) => {
  const company = demoCompanies.find((c) => c._id === req.params.id);
  if (!company) { res.status(404).json({ success: false, message: 'Company not found', code: 'NOT_FOUND' }); return; }
  const opportunities = demoOpportunities.filter((row: any) => row.companyId === company._id);
  res.json({ success: true, data: { ...company, opportunities } });
});
export default router;
