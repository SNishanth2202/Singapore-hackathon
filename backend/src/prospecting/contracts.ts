import { z } from 'zod';
import { ResearchRecord } from '../integrations/research/store';
// Older clients saved industries; accept and discard that retired setting.
export const SettingsSchema = z.preprocess(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const { industries: _retired, ...settings } = value as Record<string, unknown>;
    return settings;
}, z.object({ markets: z.array(z.string().trim().min(2).max(60)).min(1).max(3), intervalMinutes: z.number().int().min(15).max(43200), enabled: z.boolean(), maxCandidates: z.number().int().min(1).max(40) }).strict());
export type Settings = z.infer<typeof SettingsSchema>;
export interface Lead {
    id: string;
    name: string;
    description: string;
    website: string | null;
    researchId: string;
    score: number;
    whyNow: string;
    analysis: any;
    sources: ResearchRecord['sources'];
    researchedAt: string;
    relationship: 'UNKNOWN';
    model: string | null;
    fitStatus?: 'SUPPORTED' | 'NEEDS_RESEARCH';
    fitReason?: string;
    analysisOrigin?: 'model' | 'sources_only';
    sourceWarnings?: string[];
    identityStatus?: 'DIRECTORY_MATCH' | 'REGISTRY_MATCH' | 'UNVERIFIED';
}
export interface Run {
    id: string;
    status: 'discovering' | 'researching' | 'completed' | 'failed';
    startedAt: string;
    finishedAt?: string;
    settings: Settings;
    candidates: string[];
    discoveryEvidence?: Record<string, import('./research').DiscoveryItem[]>;
    cursor: number;
    drafts: Lead[];
    reviews?: Lead[];
    currentCompany?: string | null;
    failures: string[];
    sourceReports: {
        source: string;
        count: number;
        status: string;
    }[];
}
export interface State {
    settings: Settings;
    nextRunAt: string | null;
    run: Run | null;
    leads: Lead[];
    history: Omit<Run, 'drafts' | 'reviews' | 'candidates' | 'discoveryEvidence'>[];
}
export const initialState = (): State => ({ settings: { markets: ['Singapore', 'India'], intervalMinutes: 240, enabled: false, maxCandidates: 3 }, nextRunAt: null, run: null, leads: [], history: [] });
export function topLeads(leads: Lead[]) { return [...new Map(leads.map(l => [l.id, l])).values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 15); }
