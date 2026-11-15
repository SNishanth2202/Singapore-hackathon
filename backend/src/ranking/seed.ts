import fs from 'fs';
import path from 'path';
import opportunities from '../fixtures/lead-ranking/opportunities.json';
import crm from '../fixtures/lead-ranking/crm.json';
import events from '../fixtures/lead-ranking/events.json';
import { DemoState, Evidence, OpportunitySchema, SourceRecord, T0 } from './contracts';
import { importSources, sourceEvidence } from './importer';

export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const fixtureCrm = crm;
export const replayEvents = events;
export function mockSalesforceProjection(state: DemoState) {
  return { ...crm,
    opportunities: state.opportunities.map(o => ({ Id: o.id, AccountId: o.accountId, Name: `${o.buyingUnit} / ${o.product}`,
      StageName: 'Qualification', Amount: o.annualDealValueSgd, CloseDate: o.deadline, OwnerId: o.ownerId,
      BuyingUnitId__c: o.buyingUnitId, SiteId__c: o.siteId, ProductCode__c: o.product,
      BuyingWindowId__c: o.buyingWindowId, isSynthetic: true })),
    contracts: crm.contracts.map(c => ({ ...c, NoticeDueAt__c: state.opportunities.find(o => `CTR-${o.id}` === c.Id)?.deadline ?? c.NoticeDueAt__c })),
    activities: [...crm.activities, ...state.history.filter(h => ['BuyingWindowConfirmed', 'RenewalNoticeConfirmed'].includes(h.eventType)).map(h => ({
      Id: `ACT-${h.eventId}`, WhatId: h.changes[0]?.id || 'O01', WhoId: 'CON-O01', ActivityDate: h.at,
      Status: 'Completed', Subject: 'Synthetic buyer window confirmation replay', isSynthetic: true,
    }))],
    cases: crm.cases.map(c => { const o = state.opportunities.find(o => `CASE-${o.id}` === c.Id);
      return { ...c, Status: o?.caseOpen ? 'Open' : 'Closed', SlaDueAt__c: o?.caseDueAt || c.SlaDueAt__c }; }),
  };
}
export const fixtureOpportunities = () => opportunities.map(o => OpportunitySchema.parse({ ...o,
  needEvidenceIds: o.needOrigin === 'public' ? (o.id === 'O01' || o.id === 'O15' ? ['S02'] : o.evidenceIds.filter(id => !['S09', 'S10'].includes(id))) : [],
}));
export function readSources(): SourceRecord[] {
  const snapshots = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/evidence/public-snapshots.json'), 'utf8'));
  const awards = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/evidence/gebiz-live-verification.json'), 'utf8'));
  return importSources([], [...snapshots.records, ...awards.records]).records;
}
export function makeSeed(empty = false): DemoState {
  const all = fixtureOpportunities(), sources = readSources();
  const evidence: Evidence[] = sources.map(sourceEvidence);
  for (const o of all) {
    const synthetic = (id: string, title: string, excerpt: string, origin: Evidence['origin'] = 'mock_salesforce'): Evidence => ({
      id, title, excerpt, origin, date: T0, url: null, locator: `Synthetic fixture ${id}; singtel-demo-v1`,
      claimStatus: 'synthetic', entity: o.account, site: o.address, sourceFamily: origin,
    });
    evidence.push(
      synthetic(`crm-need-${o.id}`, 'Mock Salesforce · operating need', o.product === 'Managed WAN renewal' ? `Active synthetic managed WAN contract CTR-${o.id} needs a renewal decision. This is not inferred from public award history.` : 'Synthetic current operating-need review; any cited public facility trigger keeps its original publication date.'),
      synthetic(`crm-window-${o.id}`, 'Mock Salesforce · buying window', o.deadline ? `Required ${o.deadlineKind}: ${o.deadline}. This date is synthetic; it is not inferred from an award.` : 'No confirmed notice date. Bounded planning alternatives are synthetic.'),
      synthetic(`crm-buyer-${o.id}`, 'Mock Salesforce · buyer readiness', `Demo contact ${o.contactId}; ${o.recentActivityAt ? 'recent two-way planning activity' : 'no recent two-way activity'}.`),
      synthetic(`crm-commercial-${o.id}`, 'Mock Salesforce · commercial estimate', `Annual contribution SGD${o.annualContributionSgd}; remaining effort ${o.pursuitHours}h. Both are prototype estimates.`),
      synthetic(o.siteEvidenceId, 'Mock engineering · site assessment', `${o.siteState}: ${o.address}; assessed ${o.siteAssessedAt}; ready-by ${o.readyBy}.`, 'mock_engineering'),
      synthetic(o.technicalEvidenceId, 'Mock engineering · mandatory requirement', o.product === 'Private 5G' ? 'AGV p95 latency must be <=20ms. Measurement not yet available; requirement is synthetic.' : `${o.technicalState}: ${o.diversePaths ?? 'unknown'} physically diverse paths; mandatory mock requirement.`, 'mock_engineering'),
    );
    o.evidenceIds.push(`crm-need-${o.id}`);
    if (o.siteUncertain) evidence.find(e => e.id === o.siteEvidenceId)!.claimStatus = 'disputed';
    if (o.needOrigin === 'public') {
      const review = synthetic(`crm-need-review-${o.id}`, 'Mock Salesforce · current planning review', 'Synthetic current review corroborates the still-applicable public facility milestone; it does not change the public publication date.');
      evidence.push(review); o.evidenceIds.push(review.id);
    }
    if (o.caseOpen) {
      const caseEvidence = synthetic(`crm-case-${o.id}`, 'Mock Salesforce · open service case', `Open synthetic service case at ${o.address}; resolve before commercial outreach. SLA due ${o.caseDueAt}.`);
      evidence.push(caseEvidence); o.evidenceIds.push(caseEvidence.id);
    }
  }
  return { schemaVersion: 1, runId: 'singtel-demo-v1', asOf: T0,
    opportunities: empty ? [] : all.filter(o => !o.hiddenUntilTrigger), sources, evidence,
    versions: {}, appliedEvents: {}, history: [], snapshots: {} as DemoState['snapshots'],
    initialized: true, sourceError: null, lastAttemptAt: T0, lastSuccessfulRefreshAt: T0 };
}
