import { z } from 'zod';

const text = z.string().trim().min(1).max(300);
const id = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
const list = z.array(text).max(40);
const ids = z.array(id).max(40);
export const EVENT_TYPES = ['ACQUISITION', 'EXPANSION', 'PARTNERSHIP', 'PRODUCT_LAUNCH', 'SECURITY_INCIDENT', 'TECHNOLOGY_CHANGE', 'HIRING', 'OTHER'] as const;
export type EventType = typeof EVENT_TYPES[number];
const httpsUrl = z.string().max(500).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use a public HTTPS source URL without credentials.');

export const OfferingSchema = z.object({
  id, name: text, category: text, aliases: list, active: z.boolean(),
  capabilities: list.min(1), customerProblems: list.min(1), buyerRoles: list.min(1),
  targetSegmentIds: ids.min(1),
  signalRules: z.object({
    // Literal phrases, not executable regular expressions. Required terms narrow a broad trigger.
    anyTerms: list.min(1), requiredAnyTerms: list, excludeTerms: list,
    allowedEventTypes: z.array(z.enum(EVENT_TYPES)).max(8).default([]),
  }).strict(),
  discoveryRules: z.array(z.object({
    eventTypes: z.array(z.enum(EVENT_TYPES)).min(1).max(8),
    anyTerms: list.min(1), requiredAnyTerms: list, excludeTerms: list,
    allowProviderContext: z.boolean().default(false),
    rationale: text,
  }).strict()).max(10).default([]),
  discoveryQuestions: list.min(1), sourceIds: ids.min(1),
  availability: z.object({ verificationRequired: z.literal(true), checks: list.min(1) }).strict(),
}).strict();

export const KnowledgeContentSchema = z.object({
  schemaVersion: z.literal(1),
  seller: z.object({
    id, name: text, legalName: text, aliases: list, entityIds: z.array(z.string().regex(/^Q\d+$/)).max(20),
    domains: z.array(z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/)).min(1).max(20),
    businessTypes: list.min(1), sourceIds: ids.min(1),
  }).strict(),
  strategy: z.object({
    provenance: z.literal('team_configured_hypotheses'),
    workflows: z.array(z.enum(['HUNT', 'FARM'])).min(1).max(2),
    priorityMarkets: list,
    objectives: z.array(z.object({ id, outcome: text, measures: list.min(1) }).strict()).min(1).max(10),
    segments: z.array(z.object({
      id, name: text, organizationTypes: list.min(1), exampleIndustries: list,
      buyerRoles: list.min(1), qualificationQuestions: list.min(1),
    }).strict()).min(1).max(15),
    exclusions: list,
  }).strict(),
  evidencePolicy: z.object({
    maxSignalAgeDays: z.number().int().min(1).max(365),
    blockedInferenceTerms: list.min(1), securityTerms: list.min(1),
    discoveryRole: text, discoveryQuestion: text,
  }).strict(),
  sources: z.array(z.object({
    id, title: text, url: httpsUrl, publisher: text, checkedAt: z.string().datetime(),
  }).strict()).min(1).max(60),
  offerings: z.array(OfferingSchema).min(1).max(40),
}).strict();

export const KnowledgeSchema = KnowledgeContentSchema.extend({
  version: z.number().int().positive(), updatedAt: z.string().datetime(),
}).superRefine((value, ctx) => {
  const unique = (values: string[], field: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [field], message: 'IDs must be unique.' });
  };
  unique(value.offerings.map((o) => o.id), 'offerings');
  unique(value.sources.map((s) => s.id), 'sources');
  unique(value.strategy.segments.map((s) => s.id), 'strategy.segments');
  unique(value.strategy.objectives.map((s) => s.id), 'strategy.objectives');
  const sources = new Set(value.sources.map((s) => s.id));
  const segments = new Set(value.strategy.segments.map((s) => s.id));
  if ([...value.seller.sourceIds, ...value.offerings.flatMap((o) => o.sourceIds)].some((s) => !sources.has(s))) {
    ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Every source reference must exist.' });
  }
  if (value.offerings.some((o) => o.targetSegmentIds.some((s) => !segments.has(s)))) {
    ctx.addIssue({ code: 'custom', path: ['offerings'], message: 'Every target segment reference must exist.' });
  }
  const offeringNames = value.offerings.flatMap((o) => [o.name, ...o.aliases]).map((s) => s.toLowerCase());
  unique(offeringNames, 'offerings');
});

export type BusinessKnowledge = z.infer<typeof KnowledgeSchema>;
export type Offering = z.infer<typeof OfferingSchema>;
