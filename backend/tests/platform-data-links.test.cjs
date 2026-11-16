process.env.STORAGE_MODE = 'memory';
process.env.LOCAL_DEMO_MODE = 'true';
process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const opportunities = require('../dist/repositories/opportunityRepository');
const companies = require('../dist/repositories/companyRepository');
const { getCompany } = require('../dist/controllers/companyController');
const { env } = require('../dist/config/env');
const { businessKnowledgeStore, getSeedKnowledge } = require('../dist/business/store');
const { analyzeCompany } = require('../dist/integrations/freellmapi/analyze');

test('populated company references serialize to stable scalar IDs and readable names', () => {
  const companyId = new Types.ObjectId(), opportunityId = new Types.ObjectId();
  const row = opportunities.serializeOpportunity({ _id: opportunityId, companyId: { _id: companyId,
    companyName: 'Linked account', salesCompanyId: 'synthetic:linked', country: 'Singapore' }, priority: 'HIGH' });
  assert.equal(row.companyId, String(companyId));
  assert.equal(row.companyName, 'Linked account');
  assert.equal(row.salesCompanyId, 'synthetic:linked');
  assert.equal(typeof row.companyId, 'string');
  assert.equal(opportunities.serializeOpportunity({ _id: opportunityId, companyId }).companyId, String(companyId));
  assert.equal(opportunities.serializeOpportunity({ _id: opportunityId, companyId: null }).companyId, '');
});

test('company detail includes its own linked opportunities and sales identity', async () => {
  const originalCompany = companies.findCompanyWithSignals, originalOpportunities = opportunities.findOpportunities;
  const companyId = '0123456789abcdef01234567';
  companies.findCompanyWithSignals = async id => ({ company: { _id: id, companyName: 'Linked account', salesCompanyId: 'synthetic:linked' }, signals: [] });
  opportunities.findOpportunities = async (filters) => {
    assert.equal(filters.companyId, companyId);
    return { opportunities: [{ _id: 'opp-1', companyId, potentialService: 'Cybersecurity' }], total: 1 };
  };
  try {
    let body; const response = { status() { return this; }, json(value) { body = value; } };
    await getCompany({ params: { id: companyId } }, response, error => { throw error; });
    assert.equal(body.data.opportunities.length, 1);
    assert.equal(body.data.opportunities[0].companyId, companyId);
    assert.equal(body.data.salesCompanyId, 'synthetic:linked');
  } finally { companies.findCompanyWithSignals = originalCompany; opportunities.findOpportunities = originalOpportunities; }
});

test('cloud company analysis uses database records even when local demonstration controls are enabled', async () => {
  const originalCompany = companies.findCompanyWithSignals, originalKnowledge = businessKnowledgeStore.read;
  const previousMode = env.STORAGE_MODE;
  let databaseReads = 0;
  companies.findCompanyWithSignals = async id => { databaseReads++; return { company: { _id: id, companyName: 'Singtel', website: 'https://www.singtel.com' }, signals: [] }; };
  businessKnowledgeStore.read = async () => getSeedKnowledge();
  env.STORAGE_MODE = 'cloud';
  try {
    const result = await analyzeCompany('0123456789abcdef01234567');
    assert.equal(databaseReads, 1);
    assert.equal(result.dataMode, 'account');
    assert.equal(result.analysisOrigin, 'seller_check');
  } finally { env.STORAGE_MODE = previousMode; companies.findCompanyWithSignals = originalCompany; businessKnowledgeStore.read = originalKnowledge; }
});
