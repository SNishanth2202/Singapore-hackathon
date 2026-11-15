# Singtel Enterprise lead-ranking agent

A local, evidence-led sales worklist for **account x buying unit x product/use case x buying window**.
It combines cited public observations with clearly synthetic Salesforce records, scores opportunities with
transparent rules, and replays the facts that change a rep's next action.

**Branch:** `Lead-Ranking-Agent`. This is a working prototype, with local persistence and mock CRM / engineering.
No real Salesforce account is connected. All buyer contacts, telco contracts, buying dates, assessments,
commercial values and Singtel customer relationships in the demo are synthetic.

## Run locally

Requires Node.js 20+ and npm. From the repository root:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
npm run dev
```

Open **http://localhost:3000**. The API runs at **http://127.0.0.1:5000/api/v1/ranking**.
No Docker, database, API key or `.env` is required for the full replay.
Stop the dev launcher with Ctrl+C. The demo state is saved under `.local/` and survives reloads/restarts.
Use the in-app Reset button to replay from the same initial state.

For a built, single-server preview:

```powershell
npm --prefix backend run build
npm --prefix frontend run build
npm start
```

Then open http://localhost:5000. Keep ports 3000 and 5000 free before starting another instance.
The Docker Compose configuration also builds the demo frontend and API with an isolated `ranking_data`
volume: `docker compose up --build`. MongoDB and Neo4j remain under the optional `legacy` profile.
The legacy app is retained at `/dashboard`, `/companies`, `/graph`, `/legacy-opportunities` and `/settings`;
its original database-backed API uses `npm --prefix backend run dev:legacy` and the legacy environment settings.

## The demo

Open **Demo checks > Replay next event**; inspect any row for scoring, mandatory conditions, scenario stability and evidence.
The initial queue has 15 opportunities; the public trigger creates the sixteenth.

| Step | Fact arriving | Visible result |
| --- | --- | --- |
| 1 | Cited SGX/EDB ETLA facility trigger | O01 created: 53 points, rank 13, Verify |
| 2 | Mock Salesforce confirms buying window | 84 points, rank 3, Verify, 80/100 ranking confidence |
| 3 | Mock Micron service case opens | Resolve replaces renewal outreach |
| 4 | Mock site assessment verifies ETLA serviceability | 89 points, rank 1, Pursue, 100/100 ranking and action confidence |
| 5 | Private 5G latency measured at 28ms | Fails mock <=20ms requirement; Blocked |
| 6 | Micron case is resolved | Renewal pursuit resumes after all gates pass |

The single queue shows rank, movement, opportunity, status, next action, owner, deadline, strongest evidence
and ranking confidence. **Status** uses the priority score: **Very urgent** (85?100), **Urgent** (70?84),
**Normal priority** (50?69), **Low priority** (25?49), and **Irrelevant** (0?24). These thresholds are our
prototype assumptions, not a prediction of buyer interest. Filter the queue by any of the five statuses.
The API exposes this label as `priorityStatus`; its existing `status` field records the recommended action.
**Pursue, Verify, Resolve, Monitor and Blocked** remain separate action labels. Required checks still control
whether pursuit is allowed. Pursue, Verify and Resolve are actionable; Monitor and Blocked remain below them.
Scenario confidence continues to measure retention of the top-five / next / waiting / blocked priority band,
rather than retention of the score-based status label.
Switch the same candidates between **CRM + public**, **CRM only**, and **Deal value**. The comparison panel
shows per-row evidence contributions and source-family ablations. Identity labels and explicit mock CRM
confirmations are held fixed; public need contributions are masked in CRM-only. Catalog reference data is
shared across those views. Ablation removes the named family's need/catalog evidence, grouping syndicated copies.

**Demo checks** provides duplicate replay, connector failure, an ambiguous entity match, unbounded evidence,
a clock advance and a healthy empty queue. A failed source refresh preserves the exact last successful
rows/version/time. An initialized zero-opportunity queue returns `[]`; failed initialization is explicitly distinct.
No new facts or threshold changes returns the same list/version. Replaying the same event ID/payload is a no-op;
a conflicting retry or aggregate-version gap is rejected.

## Rules and confidence

The deterministic 100-point rubric weights **need/timing 35, product fit 25, buyer readiness 20,
annual gross contribution 15, and pursuit effort 5**. These are our own starting assumptions.
Application code applies gates, points and the stable score/deadline/canonical-ID tiebreak. An LLM never sorts.
Site serviceability, a product-specific mandatory technical condition and the notice/bid deadline must be checked.
UNKNOWN produces Verify, confirmed FAIL produces Blocked, and all PASS permits Pursue in an active window.
A service case can produce Resolve before commercial outreach. Technical requirements are mock, not Singtel SLAs.

Ranking confidence is **scenario stability**, separate from the priority score:

`ranking confidence = 100 x share of ten whole-queue scenarios retaining the displayed priority band`

WORK_NOW is the first five actionable opportunities, followed by NEXT, WAITING and BLOCKED bands.
**80/100 means eight of ten tested worlds retained the band**, not an 80% chance of winning.
Show plausible rank range, next-action stability and the fact worth verifying. Shared contribution, effort
and installation assumptions vary together. Verified facts replace disputed alternatives in all ten worlds.
If plausible inputs cannot be bounded, show **Insufficient evidence**, including for potentially affected
competitors; retain numeric stability for bands whose invariance can be established.

## Sources and optional live LLM

The demo bundles **11 curated public snapshots and 11 GeBIZ award records** captured on 15 November 2026.
The source library exposes exact URLs, dates, excerpts, matched context and claim status. Source families:
GeBIZ, SGX, company releases/reports, EDB/JTC, IMDA/industry, and Singtel product/case-study material.
An award establishes supplier/date context; it does not establish a telco expiry or notice deadline.
A syndicated announcement is one provenance group, not additional need points.

The integrated GeBIZ connector supports complete pagination, schema checks, bounded HTTP retries and failure
retention. Use Demo checks > Check live GeBIZ connector, or verify the standalone ingestion spike:

```powershell
node tools/gebiz-connector.mjs docs/evidence/gebiz-live-verification.json
```

Offline extraction is explicitly labelled **curated snapshot**; it is not represented as a live LLM result.
To enable the live extraction button, set both `OPENAI_API_KEY` and `OPENAI_MODEL` in a root `.env` or the
backend process environment, using a model available to your account. No key is sent to the browser.
The adapter uses the [OpenAI Responses API with structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses),
checks source IDs and exact supplied spans, handles incomplete responses, and caches outputs by model,
prompt version and source hash. It returns facts and opportunity hypotheses for review; it cannot pass gates,
set points, send outreach or silently add an unreviewed account. Live model access is optional and is not
included in the credential-free validation. The six-event demo uses reviewed fixture candidates.

## Verify

```powershell
npm --prefix backend run test:ranking
node --test tools/gebiz-connector.test.mjs
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run verify:ranking-demo
npm --prefix frontend run test:e2e
```

Playwright uses installed Microsoft Edge on Windows, or Chromium on Linux (`npx playwright install chromium`
from frontend). Its web-server configuration starts local servers if needed. Tests reset the isolated demo;
finish a recording before running them. `.local/readiness-report.json` records executed replay outcomes,
and `.local/screenshots/` holds desktop, scenario and mobile captures. GitHub Actions runs the same checks.
The historical `docs/evidence/planning-validation.json` records earlier arithmetic checks, not application tests.

## Implementation map

| Area | Files |
| --- | --- |
| Zod contracts and seed | `backend/src/ranking/contracts.ts`, `seed.ts`, `backend/src/fixtures/lead-ranking/` |
| Rules, gates and ten worlds | `backend/src/ranking/engine.ts` |
| Replay, refresh, audit and atomic persistence | `backend/src/ranking/service.ts` |
| Shared source importer / live GeBIZ / optional LLM | `backend/src/ranking/importer.ts`, `extractor.ts` |
| API and standalone server | `backend/src/routes/ranking.routes.ts`, `backend/src/ranking/demo-server.ts` |
| Queue, drawer, replay and comparisons | `frontend/src/pages/LeadRankingQueue.tsx`, `lead-ranking.css` |
| API client and last-successful browser cache | `frontend/src/services/ranking.service.ts`, `frontend/src/hooks/useRankingQueue.ts` |
| Automated checks | `backend/test/`, `frontend/e2e/`, `tools/gebiz-connector.test.mjs` |

The default demo store is atomic local JSON, serialized through one process. It is deliberately independent
of MongoDB/Neo4j so a judge can run it immediately. A multi-user production service would need a shared
transactional store, authentication, real CRM integration and operational approvals; those are not claimed here.
The frozen clock is 15 November 2026 09:00 SGT. `DEMO_REAL_CLOCK=true` enables periodic real-clock checks;
otherwise the explicit clock control makes threshold tests reproducible.

- [Original implementation plan and acceptance criteria](docs/lead-ranking-plan.md)
- [Data contracts and 16-opportunity matrix](docs/lead-ranking-contracts.md)
- [Source inventory, access checks and refresh cadence](docs/lead-ranking-sources.md)
- [Seven-minute demo script](docs/lead-ranking-demo.md)
- [Build verification and implementation notes](docs/lead-ranking-delivery.md)
