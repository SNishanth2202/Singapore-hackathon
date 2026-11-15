import { Band, Component, DAY, Decision, Evidence, GateResult, Opportunity, PriorityStatus, QueueRow, ScenarioResult, Status, View, clone } from './contracts';

export const SCENARIOS = [
  'Displayed facts', 'Feasible site / early notice', 'Conservative contribution', 'Higher contribution',
  'Site cannot be delivered', 'Failed site / higher effort', 'Lower pursuit effort',
  'Shared delivery lead: 45 days', 'UMC technical check passes', 'Earlier Customs notice',
];
const tier = (status: Status) => status === 'Monitor' ? 1 : status === 'Blocked' ? 2 : 0;
const contributionPoints = (n: number) => n >= 50000 ? 15 : n >= 20000 ? 10 : n >= 5000 ? 5 : 0;
const effortPoints = (n: number) => n <= 8 ? 5 : n <= 24 ? 3 : 0;
const dateNumber = (value: string | null) => value ? Date.parse(value) : Infinity;
// Demo assumptions: urgency describes score; mandatory gates still control the action.
export function priorityStatusFor(score: number): PriorityStatus {
  return score >= 85 ? 'Very urgent' : score >= 70 ? 'Urgent' : score >= 50 ? 'Normal priority' : score >= 25 ? 'Low priority' : 'Irrelevant';
}
export function timingPoints(deadline: string | null, asOf: string): number {
  const days = (dateNumber(deadline) - Date.parse(asOf)) / DAY;
  return days <= 0 ? 0 : days <= 7 ? 20 : days <= 30 ? 16 : days <= 90 ? 10 : days <= 180 ? 5 : 0;
}
const evidenceFor = (o: Opportunity, key: string): string[] => [key === 'site' ? o.siteEvidenceId : key === 'technical' ? o.technicalEvidenceId : `crm-window-${o.id}`];
export function gates(o: Opportunity, asOf: string, leadDays = 30): GateResult[] {
  const staleSite = Date.parse(asOf) - Date.parse(o.siteAssessedAt) > 30 * DAY;
  const staleTech = Date.parse(asOf) - Date.parse(o.technicalAssessedAt) > 30 * DAY;
  let site = staleSite || o.matchStatus === 'ambiguous' ? 'UNKNOWN' as const : o.siteState;
  if (o.product === 'New-site connectivity' && site === 'PASS' && Date.parse(o.readyBy) < Date.parse(asOf) + leadDays * DAY) site = 'FAIL';
  let technical = staleTech ? 'UNKNOWN' as const : o.technicalState;
  if (!staleTech && o.latencyMs !== null && o.product === 'Private 5G') technical = o.latencyMs <= 20 ? 'PASS' : 'FAIL';
  if (!staleTech && o.diversePaths !== null && o.product !== 'Private 5G') technical = o.diversePaths >= 2 ? 'PASS' : 'FAIL';
  const deadline = !o.deadline ? 'UNKNOWN' : Date.parse(o.deadline) <= Date.parse(asOf) ? 'FAIL' : 'PASS';
  return [
    { gate: 'site', state: site, condition: `Exact premises serviceable by ${o.readyBy.slice(0, 10)}`,
      actual: o.address, evidenceIds: evidenceFor(o, 'site'), reason: staleSite ? 'Assessment older than 30 days' : o.matchStatus === 'ambiguous' ? 'Entity/site match needs review' : site === 'FAIL' ? 'Cannot deliver service by ready-by date' : site === 'UNKNOWN' ? 'Site assessment disputed or missing' : 'Mock engineering assessment confirms delivery' },
    { gate: 'technical', state: technical, condition: o.product === 'Private 5G' ? 'AGV-zone p95 round-trip latency <=20 ms (mock requirement)' : 'At least two physically diverse access paths (mock requirement)',
      actual: o.product === 'Private 5G' ? o.latencyMs === null ? 'RF/latency test not measured' : `${o.latencyMs} ms measured` : o.diversePaths === null ? 'Route diversity not assessed' : `${o.diversePaths} diverse paths`, evidenceIds: evidenceFor(o, 'technical'), reason: staleTech ? 'Technical assessment older than 30 days' : technical === 'UNKNOWN' ? 'Mandatory technical proof missing' : technical === 'FAIL' ? 'Confirmed mandatory technical failure' : 'Mock technical check passed' },
    { gate: 'deadline', state: deadline, condition: 'Mandatory bid / order notice must arrive before the required deadline', actual: o.deadline || 'Notice date not confirmed', evidenceIds: evidenceFor(o, 'deadline'), reason: deadline === 'FAIL' ? 'Mandatory deadline has passed' : deadline === 'UNKNOWN' ? 'Required notice date needs confirmation' : 'Notice / bid window remains open' },
  ];
}
function nextBusinessDay(now: string): string {
  const value = new Date(Date.parse(now) + DAY);
  while ([0, 6].includes(value.getUTCDay())) value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}
function decision(o: Opportunity, checks: GateResult[], asOf: string) {
  const failed = checks.find(g => g.state === 'FAIL');
  const unknown = checks.find(g => g.gate === 'deadline' && g.state === 'UNKNOWN') || checks.find(g => g.state === 'UNKNOWN');
  let status: Status, actionCode: string, nextAction: string;
  if (failed) {
    status = 'Blocked'; actionCode = `BLOCKED_${failed.gate.toUpperCase()}`;
    nextAction = `Resolve ${failed.gate} failure: ${failed.reason.toLowerCase()}.`;
  } else if (unknown || o.matchStatus === 'ambiguous') {
    status = 'Verify'; actionCode = o.matchStatus === 'ambiguous' ? 'VERIFY_MATCH' : unknown?.gate === 'deadline' ? 'VERIFY_BUYING_WINDOW' : `VERIFY_${unknown?.gate.toUpperCase()}`;
    nextAction = o.matchStatus === 'ambiguous' ? 'Confirm the buying unit and exact site before joining these records.' : unknown?.gate === 'deadline' ? 'Confirm the contractual notice or purchase deadline with the buyer.' : unknown?.gate === 'site' ? 'Confirm serviceability and delivery access for the exact premises.' : o.product === 'Private 5G' ? 'Measure p95 latency in the proposed AGV zone before proposing a pilot.' : 'Obtain a route assessment proving two physically diverse access paths.';
  } else if (o.caseOpen) {
    status = 'Resolve'; actionCode = 'RESOLVE_SERVICE_CASE'; nextAction = 'Resolve the open service case with the service manager before commercial outreach.';
  } else if (dateNumber(o.deadline) - Date.parse(asOf) > 90 * DAY) {
    status = 'Monitor'; actionCode = 'MONITOR_WINDOW'; nextAction = 'Review facility progress and recheck the procurement window in seven days.';
  } else {
    status = 'Pursue'; actionCode = o.product === 'Managed WAN renewal' ? 'PURSUE_RENEWAL' : o.product === 'Private 5G' ? 'PURSUE_5G_PILOT' : 'PURSUE_NEW_SITE';
    nextAction = o.product === 'Managed WAN renewal' ? 'Schedule the buying-unit renewal review and prepare the managed WAN offer.' : o.product === 'Private 5G' ? 'Book a scoped private 5G pilot discussion using the verified site assessment.' : 'Prepare the managed connection proposal and confirm the site delivery plan.';
  }
  const soon = Math.min(Date.parse(asOf) + DAY, dateNumber(o.deadline));
  const due = status === 'Blocked' ? Date.parse(asOf) + 7 * DAY : status === 'Monitor' ? Math.min(Date.parse(asOf) + 7 * DAY, dateNumber(o.deadline) - 90 * DAY) : status === 'Resolve' ? dateNumber(o.caseDueAt) : status === 'Pursue' ? Math.min(Date.parse(nextBusinessDay(asOf)), dateNumber(o.deadline)) : soon;
  return { status, actionCode, nextAction, taskDueAt: new Date(Number.isFinite(due) ? due : Date.parse(asOf) + DAY).toISOString() };
}
export function scoreOpportunity(input: Opportunity, asOf: string, view: View = 'crm_plus_public', leadDays = 30) {
  const o = clone(input);
  const checks = gates(o, asOf, leadDays);
  const need = view === 'crm_only' && o.needOrigin === 'public' ? 0 : o.need;
  const recent = o.recentActivityAt && Date.parse(asOf) - Date.parse(o.recentActivityAt) <= 30 * DAY && Date.parse(o.recentActivityAt) <= Date.parse(asOf) ? 7 : 0;
  const parts: Component[] = [
    { name: 'Need & timing', points: need + timingPoints(o.deadline, asOf), max: 35, reason: `${need} need + ${timingPoints(o.deadline, asOf)} timing; notice date kept separate from contract end`, evidenceIds: [...(need ? o.needOrigin === 'public' ? [...o.needEvidenceIds, `crm-need-review-${o.id}`] : [`crm-need-${o.id}`] : []), `crm-window-${o.id}`] },
    { name: 'Product fit', points: (o.directFit ? 10 : 5) + (o.catalogAvailable ? 5 : 0) + checks.slice(0, 2).filter(g => g.state === 'PASS').length * 5, max: 25, reason: `${o.directFit ? 10 : 5} use-case + ${o.catalogAvailable ? 5 : 0} catalog + 5 per passed fulfilment check`, evidenceIds: [o.product === 'Private 5G' ? 'S10' : 'S09', o.siteEvidenceId, o.technicalEvidenceId] },
    { name: 'Buyer readiness', points: (o.contactId ? 5 : 0) + recent + (o.windowConfirmed ? 8 : 0), max: 20, reason: `Named contact ${o.contactId ? 5 : 0}; recent two-way activity ${recent}; confirmed window ${o.windowConfirmed ? 8 : 0}`, evidenceIds: [`crm-buyer-${o.id}`, `crm-window-${o.id}`] },
    { name: 'Contribution', points: contributionPoints(o.annualContributionSgd), max: 15, reason: `Estimated annual gross contribution SGD ${o.annualContributionSgd.toLocaleString('en-SG')}; synthetic, not award amount`, evidenceIds: [`crm-commercial-${o.id}`] },
    { name: 'Pursuit effort', points: effortPoints(o.pursuitHours), max: 5, reason: `${o.pursuitHours} estimated remaining hours; lower effort earns more points`, evidenceIds: [`crm-commercial-${o.id}`] },
  ];
  const score = parts.reduce((n, p) => n + p.points, 0);
  return { ...o, ...decision(o, checks, asOf), gates: checks, components: parts, score, priorityStatus: priorityStatusFor(score) };
}
type Scored = ReturnType<typeof scoreOpportunity>;
function sortRows(rows: Scored[], view: View) {
  rows.sort((a, b) => view === 'deal_value' ? b.annualDealValueSgd - a.annualDealValueSgd || a.id.localeCompare(b.id) : tier(a.status) - tier(b.status) || b.score - a.score || dateNumber(a.deadline) - dateNumber(b.deadline) || a.id.localeCompare(b.id));
  let workingRank = 0;
  return rows.map((row, i) => {
    if (tier(row.status) === 0) workingRank++;
    const priorityBand: Band = row.status === 'Blocked' ? 'BLOCKED' : row.status === 'Monitor' ? 'WAITING' : workingRank <= 5 ? 'WORK_NOW' : 'NEXT';
    return { ...row, rank: i + 1, priorityBand };
  });
}
function world(opportunities: Opportunity[], i: number, asOf: string, view: View) {
  return sortRows(opportunities.map(input => {
    const o = clone(input);
    if (o.estimated) {
      if (i === 2) o.annualContributionSgd *= 0.8;
      if (i === 3) o.annualContributionSgd *= 1.2;
      if (i === 5) o.pursuitHours *= 1.25;
      if (i === 6) o.pursuitHours *= 0.75;
    }
    if (o.id === 'O01') {
      if (o.siteUncertain) o.siteState = (['UNKNOWN', 'PASS', 'PASS', 'PASS', 'FAIL', 'FAIL', 'UNKNOWN', 'PASS', 'UNKNOWN', 'PASS'] as const)[i];
      if (!o.deadline && i > 0) { o.deadline = o.deadlineAlternatives[(i - 1) % o.deadlineAlternatives.length]; o.windowConfirmed = true; }
    }
    if (o.id === 'O13' && !o.deadline && i > 0) { o.deadline = o.deadlineAlternatives[[1, 2, 4, 6].includes(i) ? 0 : 1]; o.windowConfirmed = true; }
    if (o.id === 'O08' && i === 8 && o.technicalState === 'UNKNOWN') { o.technicalState = 'PASS'; o.diversePaths = 2; }
    if (o.id === 'O08' && i === 2 && o.technicalState === 'UNKNOWN') { o.technicalState = 'FAIL'; o.diversePaths = 1; }
    if (o.id === 'O09' && i === 3 && o.technicalState === 'UNKNOWN') { o.technicalState = 'FAIL'; o.diversePaths = 1; }
    if (o.id === 'O11' && i === 6 && o.siteState === 'UNKNOWN') o.siteState = 'PASS';
    if (o.id === 'O13' && i === 7 && o.siteState === 'UNKNOWN') o.siteState = 'FAIL';
    if (o.id === 'O06' && i === 9 && o.deadlineAlternatives.length) o.deadline = o.deadlineAlternatives[0];
    if (o.id === 'O15' && o.latencyMs === null && i === 1) o.latencyMs = 10;
    if (o.id === 'O15' && o.latencyMs === null && i === 9) o.latencyMs = 28;
    return scoreOpportunity(o, asOf, view, i === 7 ? 45 : 30);
  }), view);
}
export const toDecision = (row: QueueRow): Decision => ({ rank: row.rank, score: row.score, status: row.status,
  priorityStatus: row.priorityStatus,
  actionCode: row.actionCode, nextAction: row.nextAction, priorityBand: row.priorityBand, confidence: row.rankingConfidence.score });

export function rankQueue(opportunities: Opportunity[], evidence: Evidence[], asOf: string, view: View = 'crm_plus_public'): QueueRow[] {
  const base = sortRows(opportunities.map(o => scoreOpportunity(o, asOf, view)), view);
  const worlds = SCENARIOS.map((_, i) => world(opportunities, i, asOf, view));
  const unbounded = opportunities.filter(o => o.unbounded).map(o => o.id);
  return base.map(row => {
    const scenarios: ScenarioResult[] = worlds.map((rows, i) => {
      const r = rows.find(v => v.id === row.id)!;
      const resolved = row.id === 'O01' && !row.siteUncertain && [4, 5].includes(i) ? ' · site verification overrides alternative' : '';
      return { id: `S${i}`, name: SCENARIOS[i] + resolved, rank: r.rank, band: r.priorityBand, score: r.score, status: r.status, actionCode: r.actionCode };
    });
    const retain = scenarios.filter(s => s.band === row.priorityBand).length;
    let unsupported = row.unbounded;
    // Admissible extremes are used only to prove that an unbounded competitor cannot affect this band.
    // They are not treated as plausible/probabilistic scenarios.
    if (!unsupported && unbounded.length && row.priorityBand !== 'BLOCKED' && row.priorityBand !== 'WAITING') {
      unsupported = worlds.some(rows => [0, 100].some(score => {
        const extreme = rows.map(r => unbounded.includes(r.id) ? { ...r, score, status: (score ? 'Pursue' : 'Blocked') as Status, deadline: score ? '2026-01-01T00:00:00Z' : null } : r);
        return sortRows(extreme, view).find(r => r.id === row.id)!.priorityBand !== rows.find(r => r.id === row.id)!.priorityBand;
      }));
    }
    const found = evidence.filter(e => row.evidenceIds.includes(e.id) || [row.siteEvidenceId, row.technicalEvidenceId, `crm-window-${row.id}`, `crm-commercial-${row.id}`, `crm-buyer-${row.id}`].includes(e.id));
    const visible = (view === 'crm_only' ? found.filter(e => e.origin !== 'public') : found).sort((a, b) => a.id.localeCompare(b.id));
    const binding = row.gates.find(g => g.state === 'FAIL') || row.gates.find(g => g.state === 'UNKNOWN');
    const strongest = (row.status === 'Resolve' ? visible.find(e => e.id === `crm-case-${row.id}`) : undefined)
      || visible.find(e => binding?.evidenceIds.includes(e.id)) || visible.find(e => e.id === `crm-window-${row.id}`) || visible[0];
    if (!strongest) throw new Error(`Missing evidence for ${row.id}`);
    const verifyNext = row.matchStatus === 'ambiguous' ? 'Confirm the legal buying unit and exact site match.' : row.siteUncertain ? 'Verify the disputed ETLA serviceability assessment.' : binding ? binding.condition : 'Reconfirm material contribution and pursuit-effort estimates.';
    return { ...row, rank: row.rank, previousRank: null, movement: 'NEW', previousDecision: null, changedFact: null,
      strongestEvidence: strongest, evidence: visible, publicContribution: row.needOrigin === 'public' ? row.need : 0,
      originalCrmDiscovery: !row.hiddenUntilTrigger,
      rankingConfidence: { score: unsupported ? null : retain * 10, retainedScenarios: unsupported ? null : retain,
        scenarioCount: 10, minRank: unsupported || unbounded.length ? null : Math.min(...scenarios.map(s => s.rank)),
        maxRank: unsupported || unbounded.length ? null : Math.max(...scenarios.map(s => s.rank)),
        actionScore: row.unbounded ? null : scenarios.filter(s => s.actionCode === row.actionCode).length * 10,
        verifyNext, insufficientEvidenceReason: unsupported ? `Plausible inputs cannot be bounded for ${unbounded.join(', ')}; this priority band may change.` : null,
        scenarios },
    };
  });
}
