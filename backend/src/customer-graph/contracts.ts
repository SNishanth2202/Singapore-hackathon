import { z } from 'zod';

export const MODEL = 'gpt-6.1-terra';
export const DATASET_ID = 'customer-graph-demo-v1';
export const SourceSchema = z.enum(['salesforce', 'calls', 'email_calendar', 'support', 'contracts', 'billing', 'services_usage']);
export type SourceKind = z.infer<typeof SourceSchema>;
export interface Artifact {
  id: string; accountId: string; source: SourceKind; format: 'record' | 'transcript' | 'email' | 'calendar' | 'ticket' | 'contract' | 'invoice' | 'inventory' | 'usage';
  title: string; occurredAt: string; filename: string; metadata: Record<string, string>; content: string; synthetic: true;
}
export interface Entity { id: string; accountId: string; kind: 'Account' | 'Person' | 'Site' | 'Service' | 'Contract' | 'Ticket' | 'Invoice'; label: string; description: string; }
export interface Account { id: string; name: string; industry: string; initials: string; description: string; }
const evidence = z.object({ artifactId: z.string(), quote: z.string().min(8).max(900) }).strict();
export const FactSchema = z.object({
  id: z.string().regex(/^fact-[a-z0-9-]+$/), accountId: z.string(), subjectId: z.string(), objectId: z.string().nullable(),
  category: z.enum(['identity', 'need', 'commitment', 'ownership', 'risk', 'commercial', 'timing', 'usage']),
  title: z.string().min(3).max(90), statement: z.string().min(10).max(700),
  value: z.string().max(200).nullable(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  evidence: z.array(evidence).min(1).max(5),
}).strict();
export const IdeaSchema = z.object({
  id: z.string().regex(/^idea-[a-z0-9-]+$/), accountId: z.string(),
  kind: z.enum(['opportunity', 'risk', 'action']), title: z.string().min(5).max(100),
  rationale: z.string().min(20).max(1000), nextAction: z.string().min(10).max(500),
  factIds: z.array(z.string()).min(2).max(8), priority: z.enum(['high', 'medium', 'low']),
}).strict();
export const ExtractionSchema = z.object({ facts: z.array(FactSchema).min(14).max(70), ideas: z.array(IdeaSchema).min(4).max(10) }).strict();
export type Extraction = z.infer<typeof ExtractionSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type Idea = z.infer<typeof IdeaSchema>;
export interface IngestionRun {
  id: string; datasetId: string; inputHash: string; createdAt: string; model: string; responseId: string;
  totalTokens: number | null; promptVersion: string; extraction: Extraction;
}
export interface GraphNode { id: string; kind: string; label: string; accountId: string; record: Entity | Artifact | Fact | Idea; }
export interface GraphEdge { id: string; from: string; to: string; type: 'BELONGS_TO' | 'ABOUT' | 'REFERS_TO' | 'EVIDENCED_BY' | 'BASED_ON' | 'FOR_ACCOUNT'; }
export interface CustomerGraph { nodes: GraphNode[]; edges: GraphEdge[]; }
