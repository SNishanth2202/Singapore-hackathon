import { createHash } from 'node:crypto';
import type { CompanyIdentity, ResearchRecord, ResearchSource } from './store';
import type { EventType } from '../../business/schema';

export type Relevance = 'COMPANY_EVENT' | 'COMMENTARY' | 'AMBIGUOUS' | 'BACKGROUND';
export interface SourceAssessment { sourceId: string; relevance: Relevance; reason: string; eventType: EventType; businessRole: 'OPERATIONS' | 'PROVIDER' | 'UNSPECIFIED'; eventId?: string }
export interface ResearchEvent {
  id: string; title: string; eventType: EventType; sourceIds: string[]; publishedAt: string | null;
  verification: 'HEADLINE_ONLY' | 'PAGE_EXCERPT'; businessRole: SourceAssessment['businessRole'];
}
export interface ResearchOverview {
  sourceCount: number; companyEventCount: number; duplicateReportCount: number; commentaryCount: number;
  backgroundCount: number; ambiguousCount: number; headlineOnlyEventCount: number;
  events: ResearchEvent[]; sourceAssessments: SourceAssessment[];
}

function normalize(text: string) { return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim(); }
function aliases(company: Pick<CompanyIdentity, 'name' | 'aliases'>): string[] {
  return [company.name, ...(company.aliases ?? [])].map(normalize).filter(s => s.length >= 3).sort((a, b) => b.length - a.length);
}
function containsName(text: string, names: string[]) { return names.some(n => (` ${normalize(text)} `).includes(` ${n} `)); }
export function headlineBody(source: ResearchSource): string {
  const suffix = ` - ${source.publisher}`;
  return source.title.toLowerCase().endsWith(suffix.toLowerCase()) ? source.title.slice(0, -suffix.length).trim() : source.title;
}
export function detectEventType(text: string): EventType {
  if (/\bacquir(?:e[sd]?|ing)|\bacquisition\b|\bmerg(?:er|es?|ing)\b/i.test(text)) return 'ACQUISITION';
  if (/\bbreach\b|\bransomware\b|\bcyber.?attack\b|\bsecurity incident\b|\bdata leak\b/i.test(text)) return 'SECURITY_INCIDENT';
  if (/\bexpand(?:s|ed|ing)?\b|\bexpansion\b|\bopens?\b|\bnew (?:office|warehouse|site|plant|facility)\b/i.test(text)) return 'EXPANSION';
  if (/\bpartner(?:s|ship|ships|ed)?\b|\balliance\b|\bcollaborat(?:e[sd]?|ion)\b/i.test(text)) return 'PARTNERSHIP';
  if (/\badopt(?:s|ed|ing|ion)?\b|\bmigrat(?:e[sd]?|ing|ion)\b|\bdeploy(?:s|ed|ment|ing)?\b|\bmoderni[sz]/i.test(text)) return 'TECHNOLOGY_CHANGE';
  if (/\blaunch(?:es|ed|ing)?\b|\bunveil(?:s|ed)?\b|\bintroduc(?:e[sd]?|ing)\b/i.test(text)) return 'PRODUCT_LAUNCH';
  if (/\bhir(?:e[sd]?|ing)\b|\brecruit(?:s|ing|ment)?\b/i.test(text)) return 'HIRING';
  return 'OTHER';
}

export function classifySource(source: ResearchSource, company: Pick<CompanyIdentity, 'name' | 'aliases'>): SourceAssessment {
  const base = { sourceId: source.id, eventType: 'OTHER' as EventType, businessRole: 'UNSPECIFIED' as SourceAssessment['businessRole'] };
  if (source.kind === 'company_profile' || !source.publishedAt) return { ...base, relevance: 'BACKGROUND', reason: 'Identity/background or undated page; useful for context, not a current event.' };
  const body = headlineBody(source);
  const names = aliases(company);
  const named = containsName(body, names);
  // A company publishing an outlook or being quoted is not the subject investing or buying.
  const commentary = /\b(?:says?|said|according to|survey|report finds|report shows|outlook|forecast|predicts?|study|economic growth|economy|research finds)\b/i.test(body);
  const type = detectEventType(body);
  const corporateAction = named && type !== 'OTHER' && !/\b(?:survey|outlook|forecast|economic growth|economy|predicts?)\b/i.test(body);
  if ((!named && source.kind === 'news_headline') || (commentary && !corporateAction)) {
    return { ...base, relevance: 'COMMENTARY', reason: named ? 'Commentary, research or quoted opinion; it does not establish the company\'s own operational change.' : 'Company appears as publisher/byline, not as the subject of the headline.' };
  }
  if (named && type !== 'OTHER') {
    const provider = type === 'PRODUCT_LAUNCH' || (type === 'EXPANSION' && /\bmodel choice\b|\bproduct (?:range|portfolio)\b|\bservices? (?:portfolio|offering)\b/i.test(body));
    return { ...base, relevance: 'COMPANY_EVENT', eventType: type, businessRole: provider ? 'PROVIDER' : 'OPERATIONS', reason: provider ? 'The company is offering a product/service; this does not establish its own procurement need.' : 'Headline describes an action involving the selected company; verify the underlying report.' };
  }
  return { ...base, relevance: 'AMBIGUOUS', reason: 'The available title does not clearly establish a current action by this company.' };
}

const stop = new Set('a an and as at be business businesses by company corporation for from has have help in into is it its launches launch launched announces announced acquisition acquires acquired acquiring of on or s the their this to with after new ltd limited inc plc enterprise multinational'.split(' '));
function signature(source: ResearchSource, company: CompanyIdentity): Set<string> {
  let title = normalize(headlineBody(source));
  for (const name of aliases(company)) title = (` ${title} `).replaceAll(` ${name} `, ' ').trim();
  return new Set(title.split(' ').filter(t => t.length >= 2 && !stop.has(t)));
}
function sameEvent(a: ResearchSource, b: ResearchSource, company: CompanyIdentity, type: EventType): boolean {
  if (!a.publishedAt || !b.publishedAt || Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) > 7 * 86400000) return false;
  if (normalize(headlineBody(a)) === normalize(headlineBody(b))) return true;
  const left = signature(a, company), right = signature(b, company);
  const common = [...left].filter(t => right.has(t));
  const union = new Set([...left, ...right]).size;
  // Multiple distinctive shared terms are needed; 'new office' alone cannot merge different sites.
  const anchors = common.filter(t => !['ai', 'cloud', 'office', 'warehouse', 'centre', 'center', 'expands', 'opens', 'services', 'network'].includes(t));
  return anchors.length >= 2 && (common.length / Math.max(1, union) >= 0.5 || (type === 'ACQUISITION' && common.length >= 3 && common.length / Math.max(1, Math.min(left.size, right.size)) >= 0.75));
}

export function buildResearchOverview(record: ResearchRecord): ResearchOverview {
  const assessments = record.sources.map(s => classifySource(s, record.company));
  const sourceMap = new Map(record.sources.map(s => [s.id, s]));
  const groups: Array<{ sources: ResearchSource[]; assessment: SourceAssessment }> = [];
  for (const assessment of assessments.filter(a => a.relevance === 'COMPANY_EVENT')) {
    const source = sourceMap.get(assessment.sourceId)!;
    const group = groups.find(g => g.assessment.eventType === assessment.eventType && g.sources.every(s => sameEvent(s, source, record.company, assessment.eventType)));
    if (group) group.sources.push(source); else groups.push({ sources: [source], assessment });
  }
  const events: ResearchEvent[] = groups.map(g => {
    const id = `event_${createHash('sha256').update(g.sources.map(s => s.id).sort().join('|')).digest('hex').slice(0, 12)}`;
    for (const a of assessments) if (g.sources.some(s => s.id === a.sourceId)) a.eventId = id;
    const representative = [...g.sources].sort((a, b) => (a.kind === 'official_page' ? -1 : 0) - (b.kind === 'official_page' ? -1 : 0) || headlineBody(a).length - headlineBody(b).length)[0];
    return { id, title: headlineBody(representative), eventType: g.assessment.eventType, sourceIds: g.sources.map(s => s.id),
      publishedAt: representative.publishedAt, verification: g.sources.every(s => s.kind === 'news_headline') ? 'HEADLINE_ONLY' : 'PAGE_EXCERPT', businessRole: g.assessment.businessRole };
  });
  return { sourceCount: record.sources.length, companyEventCount: events.length,
    duplicateReportCount: groups.reduce((sum, g) => sum + g.sources.length - 1, 0),
    commentaryCount: assessments.filter(a => a.relevance === 'COMMENTARY').length,
    backgroundCount: assessments.filter(a => a.relevance === 'BACKGROUND').length,
    ambiguousCount: assessments.filter(a => a.relevance === 'AMBIGUOUS').length,
    headlineOnlyEventCount: events.filter(e => e.verification === 'HEADLINE_ONLY').length,
    events, sourceAssessments: assessments };
}
