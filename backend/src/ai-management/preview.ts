import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { saveResearch } from '../integrations/research/store';
import { appendActivity, findCompanyActivities } from '../salesStore';
import { recordDiscoveryHandoff, recordDiscoverySnapshot } from '../sales/workflow';
import { AppError } from '../utils/errors';
import { localClock } from './scheduler';
import { getAiManagementSettings, saveDailyRankingRun } from './store';

/** Clearly labelled synthetic companies for Local Preview Mode. Contacts use the reserved .invalid domain. */
const COMPANIES = [
  { slug: 'harbourline-logistics', name: 'Harbourline Logistics (Synthetic)', country: 'Singapore', industry: 'Logistics', service: 'International connectivity',
    headline: 'Harbourline Logistics announces regional expansion with new Jakarta and Ho Chi Minh City hubs', score: 78, priority: 'Urgent',
    contact: { name: 'Mei Tan', role: 'Head of IT Infrastructure', email: 'mei.tan@harbourline.invalid' } },
  { slug: 'kestrel-health', name: 'Kestrel Health Group (Synthetic)', country: 'Malaysia', industry: 'Healthcare', service: 'Cybersecurity',
    headline: 'Kestrel Health Group reviews security controls after a phishing campaign targeted regional clinics', score: 71, priority: 'Urgent',
    contact: { name: 'Arjun Nair', role: 'Chief Information Security Officer', email: 'arjun.nair@kestrelhealth.invalid' } },
  { slug: 'orchid-precision', name: 'Orchid Precision Manufacturing (Synthetic)', country: 'Singapore', industry: 'Manufacturing', service: 'Enterprise 5G',
    headline: 'Orchid Precision opens a new plant in Tuas focused on automated production lines', score: 64, priority: 'Normal priority',
    contact: { name: 'Daniel Lim', role: 'Director of Operations', email: 'daniel.lim@orchidprecision.invalid' } },
];

export function previewSeedingAllowed() {
  const syntheticPreview = env.HOSTED_PREVIEW && env.STORAGE_MODE === 'memory' && env.LOCAL_DEMO_MODE;
  return env.SALES_EMAIL_PROVIDER === 'mock' && (env.NODE_ENV !== 'production' || syntheticPreview);
}

export async function seedPreviewCompanies(now = new Date()) {
  if (!previewSeedingAllowed()) throw new AppError('Synthetic preview companies are only available with the synthetic email provider outside production.', 403, 'DEMO_ONLY');
  const settings = await getAiManagementSettings();
  const date = localClock(now, settings.timezone).date;
  const created: string[] = [];
  const leads = [];
  for (const [index, company] of COMPANIES.entries()) {
    const companyId = 'synthetic:' + company.slug;
    const existing = await findCompanyActivities(companyId);
    const sourceId = 'source-' + company.slug;
    if (!existing.length) {
      const researchId = 'research-' + randomUUID();
      const source = { id: sourceId, kind: 'news_headline' as const, title: company.headline + ' (synthetic)', url: 'https://example.com/synthetic/' + company.slug,
        publisher: 'Synthetic preview data', excerpt: 'Synthetic preview record. ' + company.headline + '.', publishedAt: now.toISOString(),
        retrievedAt: now.toISOString(), contentHash: 'c'.repeat(64), verification: 'headline_only' as const };
      await saveResearch({ id: researchId, company: { entityId: 'Q' + (900000000 + index), name: company.name, description: `Synthetic ${company.industry.toLowerCase()} company used for the AI Management preview.`,
        website: 'https://example.com', wikipediaTitle: null, aliases: [], identitySource: 'synthetic preview fixture' }, sources: [source], warnings: ['Synthetic preview data'], createdAt: now.toISOString() });
      const context = { companyId, companyName: company.name, researchId, country: company.country, industry: company.industry, service: company.service,
        sourceIds: [sourceId], isSynthetic: true, evidence: [{ sourceId, title: source.title, url: source.url, publishedAt: source.publishedAt, excerpt: source.excerpt, kind: source.kind, verification: source.verification }] };
      await recordDiscoverySnapshot(context);
      await recordDiscoveryHandoff({ ...context, candidates: [{ opportunityId: 'DISC-' + company.slug, service: company.service }] });
      await appendActivity({ eventId: 'selected:' + companyId, type: 'SELECTED', companyId, companyName: company.name, country: company.country, industry: company.industry,
        sourceIds: [], isSynthetic: true, createdAt: new Date(), payload: { selectedAt: now.toISOString(), origin: 'synthetic_preview' } });
      await appendActivity({ eventId: 'contact:' + companyId + ':' + company.contact.email, type: 'CONTACT_IDENTIFIED', companyId, companyName: company.name,
        contactId: 'contact-' + company.slug, contactName: company.contact.name, contactEmail: company.contact.email, sourceIds: [], isSynthetic: true, createdAt: new Date(),
        payload: { role: company.contact.role, source: 'Synthetic preview contact (reserved .invalid domain; never deliverable)', outreachBasis: 'RECORDED_CONSENT',
          reviewedBySalesperson: true, origin: 'synthetic_demo' } });
      created.push(companyId);
    }
    leads.push({ companyId, companyName: company.name, opportunityId: 'DISC-' + company.slug, rank: index + 1, score: company.score, confidence: 75,
      status: 'Pursue', priority: company.priority, product: company.service, nextAction: 'Confirm whether the public signal reflects a current need',
      sourceIds: [sourceId], country: company.country, industry: company.industry, summary: company.headline + ' (synthetic)' });
  }
  await saveDailyRankingRun({ runId: 'daily-ranking:preview:' + date, localDate: date, status: 'COMPLETED', trigger: 'MANUAL', startedAt: now, completedAt: new Date(),
    target: settings.dailyTarget, discovered: leads.length, ranked: leads.length, selected: leads.length, rejected: 0, skipped: 0,
    companyIds: leads.map(lead => lead.companyId), selectedLeads: leads, queueVersion: 'synthetic-preview' });
  return { created, queued: leads.map(lead => lead.companyId), synthetic: true,
    note: 'Synthetic preview companies and contacts. The mock provider records messages locally; nothing is sent.' };
}
