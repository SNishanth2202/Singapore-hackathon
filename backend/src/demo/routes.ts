import { Router } from 'express';
import { demoCompanies } from './companies';

const router = Router();
router.get('/analytics/overview', (_req, res) => {
  const counts = (field: 'country' | 'industry') => [...new Set(demoCompanies.map(c => c[field]))]
    .map(value => ({ [field]: value, count: demoCompanies.filter(c => c[field] === value).length }));
  res.json({ success: true, data: { totalCompanies: demoCompanies.length, newThisWeek: 0, openOpportunities: 0,
    highPriorityOpportunities: 0, companiesByCountry: counts('country'), companiesByIndustry: counts('industry'), isMockData: true } });
});
router.get('/opportunities', (_req, res) => res.json({ success: true, data: [], isMockData: true, meta: { total: 0, page: 1, limit: 25, totalPages: 0 } }));
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
