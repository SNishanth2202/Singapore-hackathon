# Data contracts and deterministic demo fixtures

**Customer policy:** [Customer audit and eligibility contract](lead-ranking-customer-audit.md) adds
`customerCheck` to eligible rows and `customerEligibility` to queue responses. Current counts are
11/12 after excluding four known-relationship leads; the older 15/16 counts below are the raw fixture universe.

**Current runtime:** [Active LLM contract](lead-ranking-llm.md) supersedes the original deterministic
score/threshold/scenario requirements below for the default mode. OpenAI chooses urgency and confidence;
the UI shows confidence as a percentage with short hover reasons and no separate score. The original
rubric and scenarios remain the offline rules baseline. All mandatory gates remain application-enforced.

Implementation update: the local demo is now built. See [delivery notes](lead-ranking-delivery.md) and the root README for executed commands and the current file-store architecture. The original specification below remains the design baseline.

Rules-baseline queue responses use `priorityStatus`: `Very urgent` (score 85+), `Urgent` (70?84),
`Normal priority` (50?69), `Low priority` (25?49), or `Irrelevant` (below 25). The existing `status`
field describes the recommended action: Pursue, Verify, Resolve, Monitor or Blocked. UI status filters
use `priorityStatus`. Priority bands used by ranking confidence remain WORK_NOW, NEXT, WAITING and BLOCKED.
Saved queues are upgraded without resetting their events or history.

These are implementation contracts, not a claim that these APIs or CRM fixtures already exist.
Use Zod as the runtime boundary and infer TypeScript types. Store ISO timestamps in UTC with source
timezone and precision; evidence may carry ISO date-only values when that is all the publisher supplied.

## Evidence and identity

`NormalizedSourceRecord` is the single importer input for live and snapshot adapters. The delivered
[GeBIZ spike output](evidence/gebiz-live-verification.json) and [curated public snapshots](evidence/public-snapshots.json)
use this shape. An input record may carry several typed claims; expand them into immutable Claim records
without losing the parent record, provenance group, locator or original value.

```ts
type SourceRecord = {
  schemaVersion: 1;
  id: string;                       // stable publisher ID, not an LLM-generated UUID
  sourceFamily: 'gebiz_award' | 'sgx' | 'company' | 'edb_jtc' | 'industry' | 'singtel';
  sourceUrl: string;                // original exact source URL
  retrievalUrl?: string;            // actual API/mirror URL used
  locator: string;                  // PDF page + section, tender + row ID, or heading
  publishedAt: string | null;       // do not substitute retrievedAt
  effectiveAt: string | null;       // award, announcement, operational milestone, etc.
  retrievedAt: string;              // ISO date or timestamp; precision recorded if date-only
  retrievedAtPrecision?: 'day' | 'instant';
  excerpt: string;                  // short verbatim span, with provenance
  entityHints: { name: string; role: string }[];
  matchedEntityId: string | null;
  matchedSiteId: string | null;
  matchStatus: 'unreviewed' | 'verified' | 'ambiguous' | 'unmatched';
  claimStatus: 'observed' | 'inferred' | 'synthetic' | 'disputed' | 'superseded';
  origin: 'public' | 'mock_salesforce' | 'mock_engineering';
  claims: Record<string, unknown>;  // family-specific Zod schema; do not accept arbitrary LLM keys
  contentHash: string;             // SHA-256 of normalized source claims
  provenanceGroupId?: string;      // same announcement copied to EDB/JTC/SGX = one group
};
```

An award's `awardDate` and `awardAmountSgd` remain different types from a contract's
`expiresAt`, `noticeDueAt`, or an opportunity's `annualContributionSgd`. A procurement description may
mention a term but still does not establish its commencement or exercised extension option.

Claim records add: `id, recordId, claimType, value, unit, effectiveFrom, effectiveTo, validUntil,
supersedesClaimId, supportingClaimIds, extractedBy, extractorVersion, reviewStatus`.
Claims extracted by an LLM begin `reviewStatus: proposed`; only a supported source span and deterministic
type validation / human-confirmed mapping can make them accepted. Store both disagreeing assessments
with a dispute relation; never silently pick the latest ingestion timestamp as truth.

Entity records: `id, legalName, UEN?, parentAccountId?, verifiedAliases[], domain?, sourceEvidenceIds[]`.
BuyingUnit: `id, accountId, unitName, siteId?, procurementOwnerContactId?`.
Site: `id, accountId, address, postcode?, building?, unit?, zone?, sourceEvidenceIds[]`.
Use source UEN/legal entity plus explicit subsidiary/site links when available; exact normalized legal
name + independently confirmed site may match a curated seed alias. Fuzzy name similarity alone yields
`ambiguous`. Do not merge a parent and subsidiary, or inherit a parent contract across subsidiaries.

Opportunity identity: `accountId + buyingUnitId + productCode + useCase + buyingWindowId`.
An unknown window has a stable provisional window ID. Resolving its dates updates that ID's facts,
preserving opportunity ID and history. Overlapping triggers for the same tuple merge evidence, while
separate contracts/sites/products remain separate opportunities. New hypothesis candidates may be
retained as Verify rows without being accepted as facts.

Dedup keys: publisher record ID + contentHash for ingestion; canonical claim fingerprint + provenance
group for syndicated claims; opportunity business identity for candidate creation. A corrected document
supersedes its previous version; it does not earn an extra need bonus. Award rows split by supplier/item
are not automatically duplicate awards (the live CPF tender has two different suppliers).

## Mock Salesforce objects

All records carry `isSynthetic: true`, `fixtureVersion: 'singtel-demo-v1'`, `recordOrigin: 'mock_salesforce'`
and `lastModifiedAt`. Use obviously synthetic contact names and `example.test` addresses. These are local
record shapes, not a claim to be the exact Salesforce REST wire format.

| Object | Salesforce-style fields plus required demo extensions |
| --- | --- |
| Account | `Id, Name, ParentId, BillingCountry, OwnerId, ExternalEntityId__c` |
| Contact | `Id, AccountId, Name, Title, Email, BuyingUnitId__c, Role__c` |
| Opportunity | `Id, AccountId, Name, StageName, Amount, CloseDate, OwnerId, BuyingUnitId__c, SiteId__c, ProductCode__c, BuyingWindowId__c, AnnualContributionEstimate__c, ContributionBounds__c, PursuitHours__c` |
| Contract | `Id, AccountId, ContractNumber, StartDate, EndDate, Status, BuyingUnitId__c, SiteId__c, NoticeDueAt__c, MandatoryNoticeRule__c, EvidenceIds__c` |
| Task/activity | `Id, WhatId, WhoId, ActivityDate, Status, Subject, Direction__c, RelevantProduct__c, Outcome__c` |
| Case | `Id, AccountId, ContactId, Status, Priority, Reason, SiteId__c, AffectedProduct__c, BlocksCommercialOutreach__c, SlaDueAt__c` |
| Mock engineering assessment | `Id, SiteId, ProductCode, assessedAt, expiresAt, serviceable, readyByFeasible, diversePaths?, p95LatencyMs?, evidenceIds, assessorId` |

Seed at least eight leaf accounts with their parent links, twelve synthetic contacts, sixteen candidate
opportunities, eight synthetic contract records, twelve activities and two cases (one initially resolved).
Every opportunity has an owner and a next-action due rule, even when Blocked. Keep API auth/secrets out
of seed data. A high parent revenue is not a scoring feature.

## Gate and score projection

```ts
type GateResult = {
  gate: 'site' | 'technical' | 'deadline';
  state: 'PASS' | 'UNKNOWN' | 'FAIL';
  condition: string;                // e.g. diverseAccessPaths >= 2
  actual: unknown;
  evidenceIds: string[];
  evaluatedAt: string;
  validUntil: string | null;
  reasonCode: string;
};
type ScoreComponent = {
  name: 'needTiming' | 'productFit' | 'buyerReadiness' | 'contribution' | 'effort';
  points: number; max: number;
  featureContributions: { ruleId: string; points: number; evidenceIds: string[] }[];
};
type RankingConfidence = {
  score: number | null;             // 0..100, never legacy 0..1
  retainedScenarios: number | null; scenarioCount: 10;
  priorityBand: 'WORK_NOW' | 'NEXT' | 'WAITING' | 'BLOCKED';
  minRank: number | null; maxRank: number | null;
  actionScore: number | null;
  verifyNext: { factId: string; ownerId: string; reason: string } | null;
  insufficientEvidenceReason: string | null;
  scenarioVersion: 'scenario-v1';
};
```

The row includes all three gate results, score components, `score`, `rubricVersion`, status, action code,
specific action text, owner, task due time, required deadline (kind/source), strongest evidence,
ranking confidence, annual deal amount for baseline comparison, and a `previousDecision` / `decisionChange`.
Strongest evidence is the most decision-relevant accepted claim, favoring the binding gate/deadline;
it is not whichever source happens to have the highest LLM confidence.

## Queue and API contract

Add under `/api/v1/ranking`; leave current company/analytics APIs compatible while the new page adopts
the queue. Any persisted legacy opportunities remain visibly separate until explicitly migrated.

| Endpoint | Behavior |
| --- | --- |
| `GET /queue?view=crm_plus_public` | Full ranked array for 16 rows; also accepts `crm_only` and `deal_value`. Server computes global ranks/bands before any future pagination |
| `GET /opportunities/:id/decision` | Component rules, evidence, gates, ten scenario outcomes, prior decision and changed fact |
| `POST /demo/events` | Validate replay event; reduce once; return the new full queue and decision differences |
| `POST /demo/clock` | Explicit `asOf`; recompute only crossed thresholds; reject time reversal outside reset |
| `POST /sources/refresh` | Attempt the verified live family; publish only complete valid staging; failure returns previous queue with degraded metadata |
| `POST /demo/reset` | Fixture version + fresh run namespace + optional empty/failure/ambiguity fixture; exposed only in demo/local mode |
| `GET /comparison` | Frozen cursor/clock, same IDs, scores/ranks/actions for all three views and source ablations |

Example response (illustrative, target post-window-confirmation state):

```json
{
  "items": [{
    "id": "O01", "rank": 3, "previousRank": 13, "movement": 10,
    "account": "Frencken / ETLA Limited", "buyingUnit": "Kaki Bukit facility",
    "product": "Managed new-site connectivity", "buyingWindowId": "BW-O01",
    "score": 84, "priorityStatus": "Urgent", "status": "Verify", "actionCode": "VERIFY_SITE",
    "nextAction": "Confirm diverse access and serviceability for the exact premises",
    "ownerId": "rep-demo-01", "taskDueAt": "2026-11-16T01:00:00Z",
    "requiredDeadline": {"kind": "order_notice", "at": "2026-11-23T01:00:00Z", "evidenceId": "crm-window-O01"},
    "strongestEvidenceId": "crm-window-O01", "isSyntheticCrm": true,
    "rankingConfidence": {"score": 80, "retainedScenarios": 8, "scenarioCount": 10,
      "priorityBand": "WORK_NOW", "minRank": 1, "maxRank": 15, "actionScore": 30,
      "verifyNext": {"factId": "assessment-etla-site", "ownerId": "engineer-demo-01", "reason": "Two scenarios leave the working band"},
      "insufficientEvidenceReason": null, "scenarioVersion": "scenario-v1"}
  }],
  "total": 16, "view": "crm_plus_public", "queueVersion": "content-hash",
  "queueComputedAt": "2026-11-15T01:00:00Z", "asOf": "2026-11-15T01:00:00Z",
  "lastSuccessfulRefreshAt": "2026-11-15T01:00:00Z", "lastAttemptAt": "2026-11-15T01:00:00Z",
  "initialized": true, "degraded": false, "sourceHealth": [],
  "rubricVersion": "rubric-v1", "scenarioVersion": "scenario-v1", "eventCursor": 2
}
```

`items` is always an array on this API, including initialized empty and degraded/uninitialized states.
On source failure preserve the exact prior `items`, `queueVersion`, ranks, movement and computed time;
only health/attempt metadata changes. Queue fingerprint includes accepted decision-relevant fact values,
view, rubric/scenario versions and relevant clock thresholds. It excludes request time, LLM wording,
health polling, ingestion-only cursor changes and object key ordering. A duplicate no-op does not advance
the **applied** event cursor.
The decision fingerprint uses only decision-relevant facts and threshold states; an unrelated event may
advance the ingestion audit cursor without changing the published queue generation or its event cursor.
Record `lastSuccessfulRefreshAt` separately from `queueComputedAt`: a successful source check can leave
the decision identical. An optional ETag identifies the queue version, not mutable health metadata.

Event envelope: `eventId, payloadHash, runId, aggregateId, aggregateVersion, eventType,
effectiveAt, receivedAt, actorId, isSynthetic, evidenceIds, payload`. The reducer's idempotency key is
`runId:eventId`; compare hashes on retries. Keep previous and next `{rank,status,actionCode,score,band,confidence}`
and the changed claim in the immutable generation audit. A change can affect competitors as well as the
directly updated opportunity; recompute and record those movements too.

## Sixteen-opportunity seed matrix

Clock T0: **2026-11-15 09:00 Asia/Singapore**. O01 is created at replay E0; all other 15 exist at reset.
The matrix below describes E1 (window confirmed, site still disputed), not current market opportunities.
`P/U/F` = PASS/UNKNOWN/FAIL, in order site/technical/deadline. Dates below are synthetic required action
deadlines at 09:00 SGT, except O13's displayed unknown. Actual contract end dates live in separate fixtures.
Public IDs map to the inventory and snapshot file; an evidence link never makes a mock contract real.

| ID | Account / buying unit | Product / use case | Deadline | Gates; status | Component points N/F/R/C/E | Score | Public basis |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| O01 | Frencken / ETLA, Kaki Bukit facility | New-site managed connection | 23 Nov 2026 | U/P/P; Verify | 31/20/20/10/3 | 84 | S01 + S02; precise order window is mock |
| O02 | Micron Singapore, existing manufacturing WAN unit | Managed WAN renewal | 20 Nov 2026 | P/P/P; Pursue (Resolve at E2) | 35/25/20/5/3 | 88 | S03 context; entire renewal is mock |
| O03 | UMC Singapore, existing Fab12i WAN unit | Managed WAN renewal | 25 Nov 2026 | P/P/P; Pursue | 31/25/20/5/5 | 86 | S04 context; renewal mock |
| O04 | Polymatech / AEIM, 163 Kallang Way | New-site managed connection | 27 Nov 2026 | P/P/P; Pursue | 31/25/12/10/5 | 83 | S05; purchase status mock, opening already announced |
| O05 | Hor Kew / Prefab Technology, existing operations WAN | Managed WAN renewal | 30 Dec 2026 | P/P/P; Pursue | 25/25/20/10/3 | 83 | S06 context; telco term mock |
| O06 | Singapore Customs, telecom procurement unit | Managed connectivity renewal | 24 Nov 2026 | P/P/P; Pursue | 31/25/12/10/3 | 81 | Live award row 1928; no expiry inferred |
| O07 | Frencken / ETLA, existing manufacturing WAN | Managed WAN renewal | 14 Jan 2027 | P/P/P; Pursue | 25/25/12/10/3 | 75 | S01/S02 context; contract mock |
| O08 | UMC Singapore, expansion facility | New-site managed connection | 29 Jan 2027 | P/U/P; Verify | 25/20/12/10/3 | 70 | S04; diverse-route assessment missing |
| O09 | Micron Singapore, HBM packaging unit | New-site managed connection | 24 Jan 2027 | P/U/P; Verify | 25/20/12/15/0 | 72 | S03; technical proof missing |
| O10 | Polymatech / AEIM, Singapore WAN unit | Managed WAN renewal | 14 Jan 2027 | P/P/P; Pursue | 25/25/5/5/5 | 65 | S05 context; contract mock |
| O11 | Hor Kew / Prefab Technology, Prefab+ 33 Kaki Bukit Road 6 | New-site connection | 15 Mar 2027 | U/P/P; Verify | 20/20/5/10/3 | 58 | S06; no telco expiry borrowed from property lease |
| O12 | Bombardier, future Seletar service facility | New-site connection | 1 Jun 2028 | P/P/P; Monitor | 15/25/5/15/0 | 60 | S07; public operations expectation H2 2028 |
| O13 | MCCY headquarters, telecom procurement unit | Managed connectivity renewal | Unknown; bounded alternative 20 Nov 2026..13 Feb 2027 | U/P/U; Verify | 15/20/5/5/3 | 48 | Live award row 480; term mock/unconfirmed |
| O14 | Bombardier, existing service-centre WAN | Managed WAN renewal | 4 Jan 2027 | P/P/P; Resolve | 25/25/12/5/3 | 70 | S07 context; open service case mock |
| O15 | Frencken / ETLA, proposed automation zone | Private 5G / AGV pilot hypothesis | 14 Jan 2027 | P/U/P; Verify | 25/15/5/15/0 | 60 | S01/S02 + S10; ETLA AGV requirement is inferred, not observed |
| O16 | Singapore Customs, separate synthetic satellite office | New-site connection | 14 Nov 2026 (missed) | P/P/F; Blocked | 15/25/12/5/3 | 60 | Award context only; site and missed condition mock |

Window intervals have stable IDs, not just a date label. New-site deadlines represent order/procurement
cutoffs, not building completion. All site/buying-unit assignments beyond a cited address are mock.
Avoid implying UMC or Micron still lacks connectivity because a historical expansion exists.

Reference estimated annual gross contributions: O01/O04/O05/O06/O07/O08/O11 = SGD30k;
O02/O03/O10/O13/O14/O16 = SGD10k; O09/O12 = SGD60k; O15 = SGD80k.
Effort: 8h for O03/O04/O10, 32h for O09, 40h for O12/O15, 16h for O01,
20h for other rows. Use these values, not just precomputed points, in scenario tests.
Synthetic annual contract values (SGD k), O01..O16:
`[200,120,100,180,220,240,160,260,600,90,210,700,80,130,1200,500]`.
Thus the deal-value top five is O15, O12, O09, O16, O08, including one Blocked and one Monitor.

At E1, expected ranked IDs are:
`O02,O03,O01,O04,O05,O06,O07,O09,O14,O08,O10,O15,O11,O13,O12,O16`.
At E0, O01 scores 53 and is rank 13; at E3 it scores 89 and becomes rank 1.
Before E1, its deadline is unconfirmed and bounded by a synthetic planning note. In scenarios S1/S4/S7
try 23 Nov 2026; S2/S5/S8 try 15 Dec 2026; S3/S6/S9 try 13 Feb 2027; S0 retains UNKNOWN.
Once E1 confirms the date, all worlds use 23 Nov. For O13, use its early bound in S1/S2/S4/S6,
late bound in S3/S5/S7/S8/S9, and UNKNOWN in S0. Record these as tested alternatives, not probabilities.

Shared assumptions: new-site ready-by dates are >45d away except O04's mock 20 December 2026
(35d). S7 can therefore block O04 without blocking O01 (ready-by 15 February 2027).
O06's earlier alternative in S9 is 19 November 2026. At E1 the O01 scenario ranks should be
`[3,1,1,1,15,15,3,1,3,1]`; after E3 they should all be 1. All numeric goldens are acceptance targets
for the future engine; the planning delivery validates their arithmetic separately from application behavior.

## Freshness and unbounded inputs

Proposed policies: daily check of watched news/SGX documents; weekly award API check despite its annual
publisher cadence; product catalog review every 30d; company report review quarterly; tender close checked
daily and before a bid action; mock engineering assessments valid 30d; CRM two-way activity recent for 30d.
Publisher cadence, transport check time and the fact's effective date are different concepts.
News older than 180d requires current corroboration for active need points; a still-future explicitly dated
milestone can remain usable with a recent CRM planning confirmation. E1 supplies that confirmation for O01.
Its E0 row may retain the historical trigger's 15 need points only when a curated review confirms the
future Q1 2027 milestone remains applicable; label this review synthetic and current, not fresh public news.

Keep old awards as historical context indefinitely; never award current need/timing points from them alone.
Expired mandatory site/technical evidence becomes UNKNOWN; expired public cache does not delete a row.
For demo reproducibility, assessment fixtures have explicit `assessedAt` and `expiresAt`, and all age checks
use T0. Curated historical snapshots display their true source date and demo as-of time.

For an unbounded candidate, compute conservative possible bands for other rows using permitted score/gate
extremes; suppress numeric confidence for every possibly affected band, explain the dependency and request
the missing bound. Retain numeric confidence only when band invariance can be proven. If proof is unavailable,
return Insufficient evidence. Never claim a precise rank range when it too is unsupported.
