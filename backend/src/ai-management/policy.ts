import { AiManagementSettingsRecord, NotificationPriority, NotificationType } from '../models/AiManagement';
import { ReplyAnalysis, ReplyIntent } from '../sales/agents/reply-understanding.agent';

export const AI_AUTHORIZATION_VERSION = 'ai-management-authorization-v1';
export const AI_AUTHORIZATION_STATEMENT = 'Enabling AI Management authorises Singtel Scout to send personalised outreach, policy-limited follow-ups and '
  + 'answers to routine questions from approved Singtel information to the verified contact, without approval of each email. '
  + 'It does not authorise pricing, negotiation, contractual, legal, technical or delivery commitments; those conversations, '
  + 'positive buying interest and anything uncertain are escalated to a salesperson and automation pauses for that company.';
export const UNSUBSCRIBE_FOOTER = 'If you would prefer not to receive further emails from us, reply "unsubscribe" and we will not contact you again.';

/** Bases that are permission-based rather than an internal assessment. */
export const PERMISSION_BASES = ['RECORDED_CONSENT', 'EXISTING_BUSINESS_RELATIONSHIP', 'INBOUND_REQUEST'] as const;
export const OUTREACH_BASES = [...PERMISSION_BASES, 'ASSESSED_LEGITIMATE_INTEREST'] as const;

/**
 * The system does not decide what the law permits. It requires a recorded basis and jurisdiction, applies the
 * organisation's configured consent-only jurisdictions, and records the activating user's compliance attestation.
 */
export function checkOutreachPermission(input: { basis?: string; jurisdiction?: string; settings: AiManagementSettingsRecord }): { allowed: boolean; reason: string } {
  if (!input.basis || !(OUTREACH_BASES as readonly string[]).includes(input.basis)) {
    return { allowed: false, reason: 'Record the reviewed outreach basis for this contact. A publicly listed address alone is not permission to send.' };
  }
  const jurisdiction = input.jurisdiction?.trim().toUpperCase();
  if (!jurisdiction || !/^[A-Z]{2}$/.test(jurisdiction)) return { allowed: false, reason: 'Record the contact’s jurisdiction as a two-letter country code.' };
  if (input.settings.consentOnlyJurisdictions.map(code => code.toUpperCase()).includes(jurisdiction)
    && !(PERMISSION_BASES as readonly string[]).includes(input.basis)) {
    return { allowed: false, reason: `Your configured policy requires recorded consent, an existing relationship or an inbound request for contacts in ${jurisdiction}.` };
  }
  return { allowed: true, reason: 'Outreach basis and jurisdiction recorded; compliance attestation required at activation.' };
}

const MONEY = /(?:S\$|SGD|USD|US\$|EUR|€|£|\$)\s?\d|\b\d[\d,.]*\s?(?:SGD|USD|dollars)\b|\b\d+\s?(?:%|percent)\s+(?:discount|off|saving)/i;
const COMMITMENT = /\b(we guarantee|guaranteed|guarantee that|we will deliver by|we commit to|binding offer|legally binding|contract terms|free of charge|at no cost|no cost to you|risk[- ]free)\b/i;
const MEETING_PROMISE = /\b(i have booked|i've booked|meeting is confirmed|i have scheduled|i've scheduled|see you on|calendar invite (?:is|has been) sent)\b/i;
const LEAKAGE = /\b(system prompt|api key|access token|as an ai language model|internal use only)\b/i;
const PLACEHOLDER = /\[(?:name|company|insert|contact)[^\]]*\]|\{\{|\}\}|<placeholder>/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Last-line checks on every autonomous message, independent of how it was generated. */
export function outboundSafetyViolations(message: { subject: string; body: string }, allowedEmails: string[] = []): string[] {
  const text = message.subject + '\n' + message.body;
  const violations: string[] = [];
  if (!message.subject.trim() || message.body.trim().length < 40) violations.push('Message is empty or too short to be meaningful.');
  if (MONEY.test(text)) violations.push('Mentions prices or commercial amounts.');
  if (COMMITMENT.test(text)) violations.push('Contains a guarantee or contractual commitment.');
  if (MEETING_PROMISE.test(text)) violations.push('Claims a meeting is booked without a verified scheduling integration.');
  if (LEAKAGE.test(text)) violations.push('May expose internal or system information.');
  if (PLACEHOLDER.test(text)) violations.push('Contains an unfilled template placeholder.');
  const allowed = new Set(allowedEmails.map(value => value.toLowerCase()));
  const strangers = (text.match(EMAIL) ?? []).filter(address => !allowed.has(address.toLowerCase()));
  if (strangers.length) violations.push('Includes an email address that is not the verified contact.');
  return violations;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY = 86_400_000;

/** Interpret a customer's requested contact time. Returns null when no time is stated. */
export function parseRequestedContactDate(text: string, now = new Date()): Date | null {
  const lower = text.toLowerCase();
  const clamp = (value: number) => new Date(Math.min(Math.max(value, +now + DAY), +now + 365 * DAY));
  const relative = lower.match(/\bin (\d{1,3}) (day|days|week|weeks|month|months)\b/);
  if (relative) {
    const amount = Number(relative[1]);
    return clamp(+now + amount * (relative[2].startsWith('day') ? DAY : relative[2].startsWith('week') ? 7 * DAY : 30 * DAY));
  }
  const dayMonth = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/)
    ?? lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dayMonth) {
    const [day, month] = /^\d/.test(dayMonth[1]) ? [Number(dayMonth[1]), MONTHS.indexOf(dayMonth[2])] : [Number(dayMonth[2]), MONTHS.indexOf(dayMonth[1])];
    let candidate = Date.UTC(now.getUTCFullYear(), month, day, 1);
    if (candidate < +now) candidate = Date.UTC(now.getUTCFullYear() + 1, month, day, 1);
    return clamp(candidate);
  }
  const afterMonth = lower.match(/\b(?:after|in|from)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (afterMonth) {
    const month = MONTHS.indexOf(afterMonth[1]) + (/\bafter\b/.test(afterMonth[0]) ? 1 : 0);
    let candidate = Date.UTC(now.getUTCFullYear(), month, 1, 1);
    if (candidate < +now) candidate = Date.UTC(now.getUTCFullYear() + 1, month, 1, 1);
    return clamp(candidate);
  }
  if (/\bnext week\b/.test(lower)) return clamp(+now + 7 * DAY);
  if (/\bnext month\b/.test(lower)) return clamp(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, Math.min(now.getUTCDate(), 28), 1));
  if (/\bnext quarter\b/.test(lower)) return clamp(+now + 90 * DAY);
  if (/\b(next year|next financial year)\b/.test(lower)) return clamp(+now + 300 * DAY);
  if (/\blater this year\b/.test(lower)) return clamp(+now + 90 * DAY);
  const weekday = lower.match(/\b(?:back|return|returning|until|on)\s+(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const delta = ((target - now.getUTCDay()) + 7) % 7 || 7;
    return clamp(+now + delta * DAY);
  }
  return null;
}

export type BuyingIntent = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
/** Buying intent is derived from what the customer asked for, not from the tone of the message. */
export function buyingIntentLevel(analysis: Pick<ReplyAnalysis, 'intent' | 'buyingSignals'>): BuyingIntent {
  const high: ReplyIntent[] = ['MEETING_REQUEST', 'PROPOSAL_REQUEST', 'PRICING_REQUEST', 'NEGOTIATION', 'SERVICE_REQUEST'];
  const medium: ReplyIntent[] = ['INTERESTED', 'PROVIDER_DISSATISFACTION', 'FUTURE_OPPORTUNITY'];
  const low: ReplyIntent[] = ['REQUEST_FOR_INFORMATION', 'SERVICE_QUESTION', 'TECHNICAL_QUESTION', 'EXISTING_PROVIDER', 'COMPETITOR_DISCUSSION', 'FOLLOWUP_REQUESTED', 'REFERRAL'];
  if (high.includes(analysis.intent)) return 'HIGH';
  if (medium.includes(analysis.intent) || analysis.buyingSignals.length) return 'MEDIUM';
  if (low.includes(analysis.intent)) return 'LOW';
  return 'NONE';
}

export const ROUTINE_INTENTS: ReplyIntent[] = ['SERVICE_QUESTION', 'REQUEST_FOR_INFORMATION', 'EXISTING_PROVIDER'];

export type ReplyDecision =
  | { action: 'SUPPRESS'; reason: string }
  | { action: 'CLOSE_NOT_INTERESTED'; reason: string }
  | { action: 'RESCHEDULE'; at: Date; kind: 'NO_REPLY_FOLLOWUP' | 'CUSTOMER_REQUESTED_FOLLOWUP'; reason: string; notify?: NotificationType }
  | { action: 'ESCALATE'; type: NotificationType; priority: NotificationPriority; reason: string }
  | { action: 'AUTO_RESPOND'; reason: string };

export function decideReplyAction(analysis: ReplyAnalysis, input: { text: string; autoResponseEligible: boolean; minimumAutoConfidence: number; now: Date }): ReplyDecision {
  const { intent } = analysis;
  if (intent === 'UNSUBSCRIBE') return { action: 'SUPPRESS', reason: 'Customer asked not to be contacted.' };
  if (analysis.promptInjectionDetected) return { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'HIGH', reason: 'Message contains instruction-like content aimed at the AI; a person must review it.' };
  if (intent === 'COMPLAINT') return { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'CRITICAL', reason: 'Customer complaint.' };
  if (intent === 'PRICING_REQUEST' || intent === 'NEGOTIATION') return { action: 'ESCALATE', type: 'PRICING_REQUEST', priority: 'HIGH', reason: 'Pricing or commercial negotiation needs approved commercial information from a salesperson.' };
  if (intent === 'MEETING_REQUEST') return { action: 'ESCALATE', type: 'MEETING_REQUEST', priority: 'HIGH', reason: 'Customer requested a meeting; availability must be confirmed by a person.' };
  if (intent === 'PROPOSAL_REQUEST') return { action: 'ESCALATE', type: 'PROPOSAL_REQUEST', priority: 'HIGH', reason: 'Customer requested a proposal.' };
  if (intent === 'INTERESTED' || intent === 'SERVICE_REQUEST' || intent === 'PROVIDER_DISSATISFACTION') {
    return { action: 'ESCALATE', type: 'POSITIVE_REPLY', priority: 'HIGH', reason: intent === 'PROVIDER_DISSATISFACTION'
      ? 'Customer described problems with their current provider — a possible opportunity for a salesperson to explore.' : 'Customer expressed genuine interest in Singtel services.' };
  }
  if (intent === 'TECHNICAL_QUESTION') return { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'MEDIUM', reason: 'Technical question requires internal technical confirmation.' };
  if (intent === 'COMPETITOR_DISCUSSION') return { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'MEDIUM', reason: 'Competitor discussion; avoid unsupported comparisons.' };
  if (intent === 'REFERRAL') return { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'MEDIUM', reason: 'Customer referred another contact; a person must verify the new contact before any outreach.' };
  if (intent === 'NOT_INTERESTED' && !analysis.buyingSignals.length) return { action: 'CLOSE_NOT_INTERESTED', reason: 'Customer declined.' };
  if (intent === 'OUT_OF_OFFICE') {
    const at = parseRequestedContactDate(input.text, input.now) ?? new Date(+input.now + 7 * DAY);
    return { action: 'RESCHEDULE', at: new Date(+at + DAY), kind: 'NO_REPLY_FOLLOWUP', reason: 'Out-of-office reply; next follow-up moved until after the contact returns.' };
  }
  if ((intent === 'FOLLOWUP_REQUESTED' || intent === 'FUTURE_OPPORTUNITY') && !analysis.requiresHuman) {
    const at = parseRequestedContactDate(input.text, input.now) ?? new Date(+input.now + 30 * DAY);
    return { action: 'RESCHEDULE', at, kind: 'CUSTOMER_REQUESTED_FOLLOWUP', reason: 'Customer asked to be contacted later.', notify: 'FUTURE_OPPORTUNITY' };
  }
  if (ROUTINE_INTENTS.includes(intent) && !analysis.requiresHuman && analysis.confidence >= input.minimumAutoConfidence && input.autoResponseEligible) {
    return { action: 'AUTO_RESPOND', reason: 'Routine question answerable from approved information.' };
  }
  return { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'MEDIUM', reason: analysis.confidence < input.minimumAutoConfidence || intent === 'AMBIGUOUS'
    ? 'Low-confidence interpretation; a person should review before replying.'
    : 'The question is outside approved knowledge or needs confirmation before a reply can be sent.' };
}
