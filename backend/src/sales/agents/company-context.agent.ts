import { z } from 'zod';
import { businessKnowledgeStore } from '../../business/store';
import { ISalesActivity } from '../../models/SalesActivity';
import { SalesCompanyContext } from '../workflow';

const Requirement = z.object({
  text: z.string().min(1),
  status: z.enum(['CUSTOMER_CONFIRMED', 'PUBLIC_SIGNAL', 'QUALIFICATION_HYPOTHESIS']),
  sourceIds: z.array(z.string()),
  sourceMessageId: z.string().optional(),
});

export const CompanyBriefSchema = z.object({
  companySummary: z.string(),
  businessContext: z.array(z.string()),
  requirements: z.array(Requirement),
  services: z.array(z.object({ id: z.string(), name: z.string(), fit: z.enum(['POTENTIAL', 'CUSTOMER_CONFIRMED']), sourceIds: z.array(z.string()) })),
  evidenceSources: z.array(z.object({ sourceId: z.string(), title: z.string(), url: z.string(), verification: z.string() })),
  confidence: z.number().min(0).max(1),
  missingInformation: z.array(z.string()),
  communicationStrategy: z.string(),
});
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;

/** Build account memory from versioned Discovery evidence and append-only sales events. */
export async function buildCompanyBrief(context: SalesCompanyContext, events: ISalesActivity[]): Promise<CompanyBrief> {
  const knowledge = await businessKnowledgeStore.read();
  const evidence = context.evidence ?? [];
  const qualification = events.filter(event => event.type === 'QUALIFIED');
  const feedback = events.filter(event => event.type === 'FEEDBACK_CAPTURED' && event.payload.verifiedByCustomer === true);
  const requirements: CompanyBrief['requirements'] = [
    ...feedback.flatMap(event => {
      const list = Array.isArray(event.payload.requirements) ? event.payload.requirements : [event.payload.requirement];
      return list.flatMap(value => {
        const text = typeof value === 'string' ? value : value && typeof value === 'object' && 'text' in value ? String(value.text) : '';
        if (!text.trim()) return [];
        const sourceMessageId = value && typeof value === 'object' && 'sourceMessageId' in value ? String(value.sourceMessageId) : event.sourceIds[0];
        return [{ text, status: 'CUSTOMER_CONFIRMED' as const, sourceIds: event.sourceIds,
          ...(sourceMessageId ? { sourceMessageId } : {}) }];
      });
    }),
    ...evidence.filter(source => source.kind === 'news_headline' || (source.kind === 'official_page' && source.publishedAt)).map(source => ({
      text: source.title, status: 'PUBLIC_SIGNAL' as const, sourceIds: [source.sourceId],
    })),
    ...qualification.map(event => ({ text: event.service ?? 'Potential Singtel service fit', status: 'QUALIFICATION_HYPOTHESIS' as const, sourceIds: event.sourceIds })),
  ];
  const qualifiedOfferingIds = new Set(qualification.map(event => event.payload.offeringId).filter(Boolean));
  const serviceNames = new Set([context.service, ...qualification.map(event => event.service)].filter(Boolean).map(value => value!.toLowerCase().trim()));
  const services = knowledge.offerings.filter(offer => offer.active && (qualifiedOfferingIds.has(offer.id)
    || [offer.id, offer.name, ...offer.aliases].some(value => serviceNames.has(value.toLowerCase().trim()))))
    .map(offer => ({ id: offer.id, name: offer.name, fit: feedback.some(event => event.service?.toLowerCase() === offer.name.toLowerCase()) ? 'CUSTOMER_CONFIRMED' as const : 'POTENTIAL' as const,
      sourceIds: offer.sourceIds }));
  const description = context.description?.trim();
  const summary = [context.companyName, context.industry, context.country].filter(Boolean).join(' is a ');
  return CompanyBriefSchema.parse({
    companySummary: description || summary || context.companyName,
    businessContext: [
      ...(context.industry ? ['Industry recorded by Discovery: ' + context.industry + '.'] : []),
      ...(context.country ? ['Country recorded by Discovery: ' + context.country + '.'] : []),
      ...(context.website ? ['Website listed in the Discovery snapshot: ' + context.website + '.'] : []),
      'Public signals and qualification matches are hypotheses; they do not establish a confirmed customer need.',
    ],
    requirements,
    services,
    evidenceSources: evidence.map(source => ({ sourceId: source.sourceId, title: source.title, url: source.url, verification: source.verification ?? 'retrieved_source' })),
    confidence: requirements.some(requirement => requirement.status === 'CUSTOMER_CONFIRMED') ? 0.78 : evidence.length ? 0.52 : 0.25,
    missingInformation: [
      ...(!context.industry ? ['Company industry'] : []),
      ...(!context.country ? ['Company country or buying location'] : []),
      ...(!events.some(event => event.type === 'CONTACT_IDENTIFIED') ? ['Verified decision-maker contact and role'] : []),
      ...(!feedback.length ? ['Customer-confirmed requirements and timeline'] : []),
    ],
    communicationStrategy: feedback.length
      ? 'Address the customer-confirmed requirements, cite only approved service information, and ask a focused next-step question.'
      : 'Use a concise, low-pressure question to verify whether the evidence-linked opportunity is relevant; do not state a need as fact.',
  });
}
