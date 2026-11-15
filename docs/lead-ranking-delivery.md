# Implemented demo and verification

Built locally on `Lead-Ranking-Agent`, 15 November 2026. Start from the root with `npm run dev` after
`npm --prefix backend ci` and `npm --prefix frontend ci`. Open http://localhost:3000/lead-ranking.

## Integration with main

Integrated main's Singtel Scout branding, company research, AI configuration and deployment work from
`5065eba`. Lead Ranking uses the shared sidebar, navbar and PageHeader, with the app's navy/teal palette,
standard type sizes and responsive spacing. `/` stays the dashboard; `/opportunities` redirects to
`/lead-ranking`. The removed summary/replay banners stay removed; compact page actions open Demo checks.
Score and numeric ranking confidence sit together before the longer next-action and evidence columns.

The root development launcher runs the full app's memory preview alongside Vite. The normal backend
`start` command retains main's cloud/hosted entry point; `dev:ranking-demo` and `start:ranking-demo`
retain the standalone ranking server. Ranking requests respect `VITE_API_BASE_URL` on a split frontend/API
host. The explicit Render hosted preview enables mutations only for the synthetic ranking demo. Its local
file state is temporary on that free deployment; it does not connect to real Salesforce. Pinned cited
snapshots are bundled under `backend/src/fixtures/lead-ranking/source-records.json` and copied into the
compiled build by TypeScript, so initialization does not depend on an external documentation folder.

## What is implemented

- A single responsive React queue for the account, buying unit/site, product/use case and window tuple.
  It shows numeric priority and ranking stability, rank movement, five priority statuses, separate recommended-action labels,
  owner, task due time, procurement notice, strongest evidence and full decision details.
- Six replayable public/CRM/engineering events. The public ETLA trigger creates a sixteenth opportunity;
  the buying-window confirmation moves it into the top-five band; site verification changes its rank,
  action and confidence. A service case and private 5G latency failure exercise other paths.
- Pure deterministic TypeScript scoring, site/technical/deadline gates, a stable global sort and ten
  whole-queue scenario evaluations. Shared contribution, effort and delivery assumptions move together.
  Unbounded inputs suppress unsupported confidence and can affect competitors' displayed stability.
- Eight leaf-account CRM fixtures, sixteen contacts, eight contracts, twelve initial activities, two cases,
  and fifteen initial opportunities. Metadata exports the current mock opportunity, contract, activity
  and case projection after replay; all commercial/engineering facts remain clearly synthetic.
- One shared importer for eleven curated source snapshots and eleven saved GeBIZ award records, plus
  a verified live GeBIZ adapter. Duplicate/syndicated records are deduplicated by provenance/hash.
  The ETLA trigger joins the named subsidiary against mock CRM accounts and retains ambiguous matches
  as verification work. Known product/catalog and source facts remain distinct from engineering proof.
- CRM-only, enriched and deal-value views on the same candidates; per-row public need contributions;
  leave-one-family-out need/catalog ablations that group syndicated evidence. Reviewed identities and
  explicit CRM facts stay fixed, so these are fixture diagnostics rather than causal performance estimates.
- Serialized event application, duplicate/conflict/version checks, atomic local JSON persistence,
  immutable decision-change history, explicit frozen-clock advancement and optional real-clock checks.
- Last-successful queue retention on source failure, browser cache on API failure, healthy empty state,
  and a distinct degraded/uninitialized state when the initial source seed cannot be read.
- Optional live LLM extraction via OpenAI structured outputs, with exact supplied evidence-span validation,
  proposed-status results and a model/prompt/source cache. Offline observations are labelled curated;
  they are not represented as an actual model run. Scores and gates remain application-controlled.
- Local launch scripts, npm lockfiles, Docker packaging/configuration and a GitHub Actions verification workflow.

## Executed checks

| Check | Result |
| --- | --- |
| Existing app business/research/AI/deployment suite | 66 tests passed, including a backend-only package check |
| Backend domain/importer/HTTP suite | 22 tests passed, including priority boundaries and saved-state upgrade |
| Standalone GeBIZ connector suite | 6 tests passed |
| Browser end-to-end suite | 4 tests passed: replay/priority filters/persistence/comparisons; failure/unbounded/empty; mobile/keyboard/source controls; shared navigation and route compatibility |
| TypeScript/backend build | Passed |
| TypeScript/Vite frontend build | Passed |
| Application replay verifier | Passed; report written to `.local/readiness-report.json` |
| Integrated live GeBIZ HTTP refresh | Succeeded 15 Nov 2026; 22 total source records, 15 initial opportunities, unchanged queue version |
| Docker Compose configuration | `docker compose config --quiet` passed; container image build/run was not exercised |
| Whitespace check | `git diff --check` passed |

The replay verifier asserts the actual engine, rather than only arithmetic:

| O01 state | Score | Rank | Priority status | Action | Ranking stability | Action stability |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| Public trigger imported | 53 | 13 | Normal priority | Verify | 50/100 | 10/100 |
| Mock buying window confirmed | 84 | 3 | Urgent | Verify | 80/100 | 30/100 |
| Mock site assessment verified | 89 | 1 | Very urgent | Pursue | 100/100 | 100/100 |

At the middle step, the ten scenario ranks are `[3,1,1,1,15,15,3,1,3,1]`; after site verification they
are all 1. Every scenario evaluates the full opportunity universe. This is scenario stability under the
prototype's tested worlds, not a calibrated likelihood of winning or a measured sales result.

Compared with the original scenario outline, the implemented set also varies UMC/Micron's missing route
assessments (S2/S3), Prefab+'s site assessment (S6), MCCY's site assessment (S7), and private 5G latency
(S1/S9). These alternatives stay within the mock planning bounds and preserve the ETLA golden example.
Verified facts override those alternatives. The original plan files remain a design baseline; executable
behavior is defined by `engine.ts`, the fixtures and their tests.

## Operational scope

This is a single-process local hackathon demo. The default authoritative store is `.local/lead-ranking-state.json`,
not MongoDB, so it starts without infrastructure. MongoDB/Neo4j and the older app are retained separately.
No real Salesforce authentication, production deployment, live customer data, automatic outreach, or real
Singtel engineering/SLA verification is claimed. Live LLM extraction needs an account key and configured
model and was not validated against a paid model endpoint. Source-family polling policies in the inventory
are proposed operational policies; the demo refresh is explicit, and clock checks are replayable.

Reset uses only the demo's own isolated state. To reproduce checks, use the commands in the root README.
The tests mutate that isolated demo state; finish any recording before running browser tests.
Screenshots are generated under `.local/screenshots/`, and CI preserves readiness reports and traces as artifacts.
