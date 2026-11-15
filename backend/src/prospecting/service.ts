import { randomUUID } from 'crypto';
import { JobStore, jobStore } from './store';
import { SettingsSchema, State, topLeads } from './contracts';
import { discover, researchLead } from './research';
import { AppError } from '../utils/errors';
export class ProspectingService {
    constructor(private store: JobStore = jobStore, private discovery = discover, private research = researchLead, private now = () => Date.now()) { }
    async read() {
        const state = await this.store.read();
        state.settings = SettingsSchema.parse(state.settings);
        if (state.run) state.run.settings = SettingsSchema.parse(state.run.settings);
        return state;
    }
    private async locked(work: (state: State) => Promise<void>) { const token = await this.store.claim(); if (!token)
        throw new AppError('Research is processing a step. Retry shortly.', 409, 'RESEARCH_BUSY'); try {
        const state = await this.read();
        await work(state);
        if (!await this.store.write(state, token))
            throw new AppError('Research lease expired; refresh status.', 409, 'LEASE_EXPIRED');
        return state;
    }
    finally {
        await this.store.release(token);
    } }
    async settings(value: unknown) { const parsed = SettingsSchema.parse(value); return this.locked(async (state) => { state.settings = parsed; state.nextRunAt = parsed.enabled ? new Date(this.now() + parsed.intervalMinutes * 60000).toISOString() : null; }); }
    async start() { return this.locked(async (state) => { if (state.run && ['discovering', 'researching'].includes(state.run.status))
        throw new AppError('A research run is already active.', 409, 'RESEARCH_BUSY'); this.begin(state); }); }
    private begin(state: State) { state.run = { id: randomUUID(), status: 'discovering', startedAt: new Date(this.now()).toISOString(), settings: structuredClone(state.settings), candidates: [], cursor: 0, drafts: [], reviews: [], currentCompany: null, failures: [], sourceReports: [] }; }
    async tick() {
        try {
            return await this.locked(async (state) => {
                if (!state.run || !['discovering', 'researching'].includes(state.run.status)) {
                    if (!state.settings.enabled || !state.nextRunAt || Date.parse(state.nextRunAt) > this.now())
                        return;
                    this.begin(state);
                }
                const run = state.run!;
                try {
                    if (run.status === 'discovering') {
                        const found = await this.discovery(run.settings);
                        run.candidates = found.names;
                        run.currentCompany = run.candidates[0] ?? null;
                        run.discoveryEvidence = found.evidence;
                        run.sourceReports = found.reports;
                        run.status = 'researching';
                        return;
                    }
                    if (run.cursor < run.candidates.length) {
                        const name = run.candidates[run.cursor];
                        try {
                            const lead = await this.research(name, run.discoveryEvidence?.[name]);
                            if (lead) {
                                (run.reviews ??= []).push(lead);
                                if (lead.fitStatus !== 'NEEDS_RESEARCH') run.drafts.push(lead);
                            }
                            else
                                run.failures.push(`${name}: identity or service fit could not be verified.`);
                        }
                        catch (error) {
                            run.failures.push(`${name}: research unavailable (${error instanceof AppError ? error.code : 'RESEARCH_UNAVAILABLE'}); no result invented.`);
                        }
                        run.cursor++;
                        run.currentCompany = run.candidates[run.cursor] ?? null;
                        return;
                    }
                    const unavailable=run.failures.filter(f=>f.includes('research unavailable')).length+(run.reviews??[]).filter(r=>r.analysisOrigin==='sources_only').length;
                    run.status = run.candidates.length && unavailable === run.candidates.length ? 'failed' : 'completed';
                }
                catch (error) {
                    run.status = 'failed';
                    run.failures.push(error instanceof AppError?`Discovery failed (${error.code}): ${error.message} Previous successful results retained.`:'Discovery failed; previous successful results retained.');
                }
                run.finishedAt = new Date(this.now()).toISOString();
                if (run.status === 'completed')
                    state.leads = topLeads(run.drafts);
                const { drafts: _d, reviews: _r, candidates: _c, discoveryEvidence: _e, ...summary } = run;
                state.history = [summary, ...state.history].slice(0, 20);
                state.nextRunAt = state.settings.enabled ? new Date(this.now() + state.settings.intervalMinutes * 60000).toISOString() : null;
            });
        }
        catch (e) {
            if (e instanceof AppError && e.code === 'RESEARCH_BUSY')
                return;
            throw e;
        }
    }
}
export const prospectingService = new ProspectingService();
let timer: ReturnType<typeof setInterval> | undefined;
export function startProspectingWorker(): () => void {
    if (!timer) {
        timer = setInterval(() => { void prospectingService.tick().catch(() => { }); }, 15000);
        timer.unref();
    }

    return () => {
        if (!timer) return;
        clearInterval(timer);
        timer = undefined;
    };
}
