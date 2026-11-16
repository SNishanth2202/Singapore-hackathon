import { BusinessKnowledge, Offering, EventType } from './schema';
import { detectEventType } from '../integrations/research/events';

export interface CompanyIdentityInput { entityId?: string; name: string; aliases?: string[]; website?: string | null }
export interface BusinessEvidence {
  id: string; title: string; text: string; kind: 'profile' | 'public' | 'sample' | 'account'; publishedAt: string | null;
  relevance?: 'COMPANY_EVENT' | 'COMMENTARY' | 'AMBIGUOUS' | 'BACKGROUND';
  eventType?: EventType; eventId?: string; businessRole?: 'OPERATIONS' | 'PROVIDER' | 'UNSPECIFIED';
  verification?: string;
}
export interface CandidateMatch { offeringId: string; evidenceIds: string[]; matchedTerms: string[]; eventIds: string[]; fitLevel: 'DIRECT_SIGNAL' | 'EXPLORATORY'; basis: string }

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function companyName(value: string): string {
  return normalized(value).replace(/(?:\s+(?:limited|ltd|incorporated|inc|corporation|corp|pte|plc))+$/g, '').trim();
}
export function containsTerm(text: string, term: string): boolean {
  return (` ${normalized(text)} `).includes(` ${normalized(term)} `);
}
export function containsAny(text: string, terms: string[]): boolean { return terms.some((term) => containsTerm(text, term)); }

/** Exact configured identities only: a name mentioning the seller is not enough. */
export function identifySeller(company: CompanyIdentityInput, knowledge: BusinessKnowledge): { isSeller: boolean; matchedBy: string | null } {
  if (company.entityId && knowledge.seller.entityIds.includes(company.entityId)) return { isSeller: true, matchedBy: 'entityId' };
  if (company.website) {
    try {
      const host = new URL(company.website).hostname.toLowerCase().replace(/^www\./, '');
      if (knowledge.seller.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return { isSeller: true, matchedBy: 'domain' };
    } catch { /* A malformed website never counts as an identity match. */ }
  }
  const names = new Set([knowledge.seller.name, knowledge.seller.legalName, ...knowledge.seller.aliases].map(companyName));
  // Candidate aliases are not trusted identity assertions; use the selected canonical name.
  if (names.has(companyName(company.name))) return { isSeller: true, matchedBy: 'name' };
  return { isSeller: false, matchedBy: null };
}

export function eligibleEvidence(evidence: BusinessEvidence[], knowledge: BusinessKnowledge, now = Date.now()): BusinessEvidence[] {
  return evidence.filter((e) => {
    const time = e.publishedAt ? Date.parse(e.publishedAt) : NaN;
    return e.kind !== 'profile' && (!e.relevance || e.relevance === 'COMPANY_EVENT') && Number.isFinite(time) && time <= now + 86400000 && now - time <= knowledge.evidencePolicy.maxSignalAgeDays * 86400000;
  });
}

export function offeringEvidenceMatch(evidence: BusinessEvidence, offering: Offering, knowledge: BusinessKnowledge): { fitLevel: CandidateMatch['fitLevel']; basis: string } | null {
  const text = `${evidence.title} ${evidence.text}`;
  if (containsAny(text, knowledge.evidencePolicy.blockedInferenceTerms)) return null;
  const type = evidence.eventType ?? detectEventType(text);
  const direct = evidence.businessRole !== 'PROVIDER'
    && (!offering.signalRules.allowedEventTypes.length || offering.signalRules.allowedEventTypes.includes(type))
    && containsAny(text, offering.signalRules.anyTerms)
    && (!offering.signalRules.requiredAnyTerms.length || containsAny(text, offering.signalRules.requiredAnyTerms))
    && !containsAny(text, offering.signalRules.excludeTerms);
  if (direct) return { fitLevel: 'DIRECT_SIGNAL', basis: 'The dated company event contains a configured service-related signal; customer demand is still unconfirmed.' };
  const discovery = offering.discoveryRules.find(rule => (evidence.businessRole !== 'PROVIDER' || rule.allowProviderContext)
    && rule.eventTypes.includes(type) && containsAny(text, rule.anyTerms)
    && (!rule.requiredAnyTerms.length || containsAny(text, rule.requiredAnyTerms)) && !containsAny(text, rule.excludeTerms));
  return discovery ? { fitLevel: 'EXPLORATORY', basis: discovery.rationale } : null;
}

export function evidenceFitsOffering(evidence: BusinessEvidence, offering: Offering, knowledge: BusinessKnowledge): boolean {
  return !!offeringEvidenceMatch(evidence, offering, knowledge);
}

/** Heuristic candidates for discovery, never a buyer-intent score or qualification. */
export function matchOfferings(knowledge: BusinessKnowledge, evidence: BusinessEvidence[], now = Date.now()): CandidateMatch[] {
  const eligible = eligibleEvidence(evidence, knowledge, now);
  return knowledge.offerings.filter((o) => o.active).flatMap((offering) => {
    const matches = eligible.filter((e) => evidenceFitsOffering(e, offering, knowledge));
    const assessments = matches.map(e => offeringEvidenceMatch(e, offering, knowledge)!);
    return matches.length ? [{ offeringId: offering.id, evidenceIds: matches.map((e) => e.id),
      eventIds: [...new Set(matches.map(e => e.eventId ?? e.id))],
      fitLevel: assessments.some(a => a.fitLevel === 'DIRECT_SIGNAL') ? 'DIRECT_SIGNAL' as const : 'EXPLORATORY' as const,
      basis: assessments.find(a => a.fitLevel === 'DIRECT_SIGNAL')?.basis ?? assessments[0].basis,
      matchedTerms: [...new Set([...offering.signalRules.anyTerms, ...offering.discoveryRules.flatMap(r => r.anyTerms)])].filter((term) => matches.some((e) => containsTerm(`${e.title} ${e.text}`, term))),
    }] : [];
  });
}
