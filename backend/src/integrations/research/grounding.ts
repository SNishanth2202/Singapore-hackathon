import { ResearchRecord } from './store';
import type { z } from 'zod';
import type { AnalysisSchema } from '../freellmapi/analyze';
import { BusinessKnowledge } from '../../business/schema';
import { getSeedKnowledge } from '../../business/store';
import { BusinessEvidence, containsAny, eligibleEvidence, matchOfferings, offeringEvidenceMatch } from '../../business/matching';
import { buildResearchOverview, ResearchOverview } from './events';

type Analysis = z.infer<typeof AnalysisSchema>;
export interface Rejection { offeringId: string; offeringName: string; item: 'need' | 'capability'; code: string; reason: string; evidenceIds: string[] }

export function researchEvidence(record: ResearchRecord, overview = buildResearchOverview(record)): BusinessEvidence[] {
  const assessments = new Map(overview.sourceAssessments.map(a => [a.sourceId, a]));
  const events = new Map(overview.events.map(e => [e.id, e]));
  return record.sources.map(s => {
    const assessment = assessments.get(s.id)!;
    const event = assessment.eventId ? events.get(assessment.eventId) : undefined;
    return { id: s.id, title: event?.title ?? s.title, text: s.excerpt ?? '',
      kind: s.kind === 'company_profile' ? 'profile' : 'public', publishedAt: s.publishedAt,
      relevance: assessment.relevance, eventType: assessment.eventType, eventId: assessment.eventId, businessRole: assessment.businessRole };
  });
}

/** Validate hypotheses, not sales qualification. Each decision has a visible reason. */
export function groundAnalysis(analysis: Analysis, evidence: BusinessEvidence[], knowledge: BusinessKnowledge) {
  const actionable = new Map(eligibleEvidence(evidence, knowledge).map(s => [s.id, s]));
  const matches = matchOfferings(knowledge, evidence);
  const catalogue = new Map(knowledge.offerings.map(o => [o.id, o]));
  const blocked = (text: string) => containsAny(text, knowledge.evidencePolicy.blockedInferenceTerms);
  const rejections: Rejection[] = [];
  const warnings: string[] = [];
  const supportedIds = (offeringId: string, ids: string[]) => {
    const candidate = matches.find(c => c.offeringId === offeringId);
    return [...new Set(ids)].filter(id => candidate?.evidenceIds.includes(id));
  };
  const explain = (offeringId: string, item: Rejection['item'], ids: string[], unsafe = false) => {
    const sources = ids.map(id => evidence.find(e => e.id === id)).filter(Boolean);
    const noCurrent = !ids.some(id => actionable.has(id));
    const code = unsafe ? 'UNSUPPORTED_INFERENCE' : sources.some(s => s?.relevance === 'COMMENTARY') && noCurrent ? 'COMMENTARY_NOT_COMPANY_EVENT' : noCurrent ? 'NO_DATED_COMPANY_EVENT' : 'NO_SERVICE_CONNECTION';
    const reason = unsafe ? 'The suggestion inferred an unsupported incident or legal-risk requirement.' : code === 'COMMENTARY_NOT_COMPANY_EVENT' ? 'The cited material is commentary or a publisher byline, not a change in this company.' : code === 'NO_DATED_COMPANY_EVENT' ? 'The cited items are background, undated, stale or not clearly about a company action.' : 'The cited company event does not support this service under the active catalogue rules.';
    rejections.push({ offeringId, offeringName: catalogue.get(offeringId)?.name ?? offeringId, item, code, reason, evidenceIds: ids });
  };
  const validatedNeeds = analysis.possibleNeeds.flatMap(need => {
    const ids = supportedIds(need.offeringId, need.evidenceIds);
    const sources = ids.map(id => actionable.get(id)!);
    const statement = `${need.need} ${need.reason}`;
    const incidentClaim = /ransomware|data breach|cyber.?attack|security incident/i.test(statement);
    const incidentSource = /ransomware|data breach|cyber.?attack|security incident/i.test(sources.map(s => `${s.title} ${s.text}`).join(' '));
    const unsafe = blocked(statement) || (incidentClaim && !incidentSource);
    if (!ids.length || unsafe) { explain(need.offeringId, 'need', need.evidenceIds, unsafe); return []; }
    if (ids.length !== new Set(need.evidenceIds).size) warnings.push(`Kept ${catalogue.get(need.offeringId)?.name} with relevant citations; excluded unrelated/background citations.`);
    const citedMatches = sources.map(s => offeringEvidenceMatch(s, catalogue.get(need.offeringId)!, knowledge)!);
    const fit = citedMatches.find(m => m.fitLevel === 'DIRECT_SIGNAL') ?? citedMatches[0];
    return [{ ...need, evidenceIds: ids, fitLevel: fit.fitLevel, basis: fit.basis,
      validationQuestion: catalogue.get(need.offeringId)!.discoveryQuestions[0] }];
  });
  // Enforce the brief limit even when a model ignores the requested response length.
  const needs = [...new Map(validatedNeeds.map(n => [n.offeringId, n])).values()]
    .sort((a, b) => Number(b.offeringId === analysis.recommendedCapability?.offeringId) - Number(a.offeringId === analysis.recommendedCapability?.offeringId))
    .slice(0, 2);
  if (validatedNeeds.length > needs.length) warnings.push('Prioritized two distinct service hypotheses to keep the discovery brief focused.');
  let capability = analysis.recommendedCapability;
  if (capability) {
    const ids = supportedIds(capability.offeringId, capability.evidenceIds);
    if (!ids.length || !needs.some(n => n.offeringId === capability?.offeringId) || blocked(capability.reason)) {
      explain(capability.offeringId, 'capability', capability.evidenceIds, blocked(capability.reason)); capability = null;
    } else capability = { ...capability, name: catalogue.get(capability.offeringId)!.name, evidenceIds: ids };
  }
  // A valid need can still support discovery when the model omits its preferred service.
  const preferredId = capability?.offeringId ?? needs[0]?.offeringId;
  const preferred = preferredId ? matches.find(c => c.offeringId === preferredId) : undefined;
  const offering = preferredId ? catalogue.get(preferredId) : undefined;
  const firstSource = preferred ? actionable.get(preferred.evidenceIds[0]) : actionable.values().next().value as BusinessEvidence | undefined;
  const eventLabel = firstSource?.eventType?.toLowerCase().replace(/_/g, ' ') ?? 'company development';
  const question = blocked(JSON.stringify(analysis.nextAction)) || /reported business developments|unmet technology need\?|which.*technology needs/i.test(analysis.nextAction.question)
    ? offering?.discoveryQuestions[0] ?? knowledge.evidencePolicy.discoveryQuestion : analysis.nextAction.question;
  const nextAction = firstSource ? {
    role: offering?.buyerRoles[0] ?? knowledge.evidencePolicy.discoveryRole,
    question: `Regarding the reported ${eventLabel} (${firstSource.title.slice(0, 150)}): ${question}`.slice(0, 800),
    whyNow: `The report was published ${firstSource.publishedAt?.slice(0, 10)}. Confirm the event, implementation timing and any unmet requirement before proposing a service.`,
  } : { role: knowledge.evidencePolicy.discoveryRole, question: knowledge.evidencePolicy.discoveryQuestion,
    whyNow: 'No eligible current company event was found in this snapshot. Check a dated company announcement or obtain direct customer context.' };
  const readiness = needs.length ? 'DISCOVERY_READY' as const : actionable.size ? 'NEEDS_RESEARCH' as const : 'HOLD' as const;
  const statusReason = needs.length
    ? `${needs.length} service ${needs.length === 1 ? 'hypothesis' : 'hypotheses'} supported for targeted discovery. Customer demand and supplier gaps are not yet confirmed.`
    : actionable.size ? 'Current company events were found, but no generated service hypothesis passed the relevance checks. Review the event and the specific rejection reasons.'
    : 'The snapshot contains no dated, eligible company event. Background, commentary and repeated coverage do not establish an operational need.';
  const securityRelevant = needs.some(n => catalogue.get(n.offeringId)?.category === 'Security');
  const unknowns = analysis.unknowns.filter(u => securityRelevant || !/cybersecurity concerns|current security concerns|cyber.?attack|ransomware/i.test(u));
  if (needs.length && !unknowns.length) unknowns.push('Whether the reported change creates an unmet requirement and which existing providers already cover it.');
  if (rejections.length) warnings.push(`${rejections.length} unsupported suggestion${rejections.length === 1 ? '' : 's'} withheld; specific reasons are listed below.`);
  return { analysis: { ...analysis, summary: blocked(analysis.summary) ? 'The source material requires verification before discussing a service.' : analysis.summary,
    possibleNeeds: needs, recommendedCapability: capability, nextAction, unknowns, readiness },
    validationWarnings: [...new Set(warnings)], rejections, statusReason };
}

export function factualResearchSummary(record: ResearchRecord, overview: ResearchOverview): string {
  const identity = `${record.company.name}: ${record.company.description || 'company identity listed in the selected directory'}.`;
  if (!overview.events.length) return `${identity} This snapshot contains background or commentary, but no clearly identified current company event.`;
  return `${identity} ${overview.events.length} distinct company event${overview.events.length === 1 ? '' : 's'} identified. ${overview.events.slice(0, 2).map(e => `${e.verification === 'HEADLINE_ONLY' ? 'Headline report' : 'Company-page report'}: ${e.title}.`).join(' ')} ${overview.headlineOnlyEventCount ? 'Article bodies and the resulting customer requirements remain unverified.' : 'Reported events do not by themselves confirm an unmet customer requirement.'}`.slice(0, 1600);
}

export function groundPublicAnalysis(analysis: Analysis, record: ResearchRecord, knowledge = getSeedKnowledge()) {
  const overview = buildResearchOverview(record);
  const grounded = groundAnalysis(analysis, researchEvidence(record, overview), knowledge);
  return { ...grounded, analysis: { ...grounded.analysis, summary: factualResearchSummary(record, overview) } };
}
