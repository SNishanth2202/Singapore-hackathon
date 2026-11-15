# Singtel Scout — implementation handover

Updated: 16 November 2026, approximately 02:23 Singapore time.

Read this before changing the code. This is an existing project with substantial **uncommitted changes**. Continue from the current files; do not reset, replace, or re-clone over them.

## 1. User objective and working constraints

Build a convincing Singtel enterprise-sales solution covering hunting, farming, evidence graphs and actionable sales recommendations. The user wants a reliable judging walkthrough, with real public company research and representative CRM account scenarios.

- Product name: **Singtel Scout**.
- Work locally until asked to publish. **Do not commit/push/deploy without asking the user.** Earlier pushes are not authorization for a new push.
- No authentication implementation requested yet; user said to add it later.
- Business offerings, matching rules and company/account content should come from the editable database catalogue, stored data or validated AI output. Avoid frontend company fixtures and invented metrics.
- The user wants polished wording without repetitive demo/prototype warnings. Improve presentation while retaining accurate data provenance; do not claim representative CRM facts, simulated email delivery, or saved reports are live customer outcomes.
- It is acceptable and preferred to process **2–3 companies per research run**, save the results and reuse them. Do not require 15 successful companies to demonstrate the core value.
- Team: Priyanshu/backend, Nishant/AI-ML, Devyansh/frontend-ML, Paari/analytics, Crystal/research-presentation. Roles are flexible.

## 2. Project, Git and hosting

Local codebase: `C:\Users\lenovo\Desktop\Singapore-hackathon`

- Current branch: `priyanshu`.
- Many modified and untracked files are intentional work from this conversation. Review `git status`; do not discard them. `desktop.ini` is unrelated and should not be committed.
- User private deployment repository: `https://github.com/Priyanshu-10112/Singapore-hackathon.git`.
- Another remote is Nishanth's shared source repository. Run `git remote -v` locally to verify exact remote names before doing anything; do not assume the private remote is origin.
- Last previously reported published commit: `55ee3a52779344765af229f4844dc5faf6e0c379`. Latest work below is NOT published.
- Hosted frontend: `https://singtel-scout.vercel.app`.
- Hosted backend: `https://enterprise-radar-api-priyanshu.onrender.com`.
- Render service ID: `srv-dbslqlmk1f9s739lh14g`.
- Render workspace ID: `tea-d6im1afkijhs7387jnt0` (My Workspace).
- Hosting configs: root `render.yaml`, `DEPLOYMENT.md`, frontend deployment configuration. Inspect actual files before release.
- Render/Vercel connectors were connected earlier. Re-discover their tools if needed. Vercel SSO approvals can expire.
- Do not assume the hosted app contains the latest local prospecting code or the repaired local environment settings.

## 3. What was JUST fixed: cloud connection root causes

The prior conclusion that both databases were simply unavailable was incomplete. The actual problems were:

1. Root `.env` still pointed MongoDB at the old Docker host `mongo` using `mongodb://`.
2. Aura URI referenced an obsolete instance `512f114b`.
3. The replacement Aura instance's actual home database is **`d12a3d7e`**, not `neo4j`.
4. Atlas allowed only the Render outbound ranges, excluding this local computer.
5. Node's inherited DNS resolver was `127.0.0.1`, refusing SRV queries. The active Wi-Fi's existing configured resolver is `10.16.0.1`.
6. The Desktop launcher always ran the memory preview, even when `.env` selected cloud storage.

These were repaired and **the running local API now reports MongoDB up, Neo4j up, storageMode cloud**.

### MongoDB Atlas

- Project ID: `6af93d7ca4daa1e82df225f4`.
- Cluster: `Cluster0`, ACTIVE, Free tier.
- Cluster hostname: `cluster0.uvpawfw.mongodb.net`.
- Database: `enterprise_radar`.
- Database user: `priyanshu`, readWrite on `enterprise_radar`.
- Complete authenticated URI is stored privately in root `.env`; do not put it in source, screenshots, logs, or chat.
- The existing `MONGODB_PASSWORD` value was used to reconstruct the URI with URL-encoded password.
- Previously authorized Render ranges remain active: `74.220.52.0/24`, `74.220.60.0/24`.
- User explicitly approved adding the current local IP for **6 hours**. The temporary /32 entry expires **16 Nov 2026, 08:12:48 SGT** (`2026-11-16T00:12:48Z`). After expiry or network change, local Atlas access may need renewal. Ask before expanding network access. Do not add `0.0.0.0/0`.

### Neo4j Aura

- Instance name: `singtel-scout`, RUNNING, AuraDB Free.
- Current instance ID: `d12a3d7e`.
- URI: `neo4j+s://d12a3d7e.databases.neo4j.io`.
- **Database name: `d12a3d7e`**.
- Username/password were taken from the existing downloaded credentials file and saved privately in `.env`.
- Original credential file: `C:\Users\lenovo\Downloads\Neo4j-d12a3d7e-Created-2026-11-15.txt`.
- Initially verified 47 nodes and 59 relationships. More may now exist after imports/new research.
- Do not delete/recreate these healthy databases.

### Local resolver configuration

- New `backend/src/config/dns.ts` and optional `DNS_SERVERS` environment setting configure **only the Node process**. They do not change OS DNS.
- Local `.env` uses the computer's existing Wi-Fi resolver `10.16.0.1`.
- This is network-specific. Do not copy this private-network resolver into Render settings. Default behaviour without DNS_SERVERS is unchanged.
- Automatic approval review rejected sending private database hostnames to Google's public DNS. Do not bypass that rejection. Local DNS diagnostics and authenticated database dashboards were used instead.
- Root `.env.before-cloud-fix.local` is an ignored private backup. Both `.env` and this backup were confirmed ignored by Git. Never include them in a commit or handover attachment.

## 4. Running local application

- Frontend: `http://127.0.0.1:3216/`.
- Lead ranking: `http://127.0.0.1:3216/lead-ranking`.
- Backend: `http://127.0.0.1:5216`.
- Health: `GET /api/v1/health`.
- Current backend runs `backend/dist/server.js`, cloud mode, development environment, CORS for frontend 3216.
- PID file: `C:\Users\lenovo\Documents\Codex\2026-10-29\se\outputs\fresh-prospect-backend.pid`.
- Logs: same outputs folder, `cloud-backend.log` and `cloud-backend-error.log`.
- **A restart is pending to load the newest `publishProspect` code**. It was built/tested after the current backend process started. MongoDB now preserves state across restart. Verify the PID/command before stopping any process.
- When starting a background process on Windows, use `Start-Process -WindowStyle Hidden`.
- Desktop entry: `Start Enterprise Radar.cmd` invokes `scripts/start-desktop.cjs`. The launcher now chooses `dist/server.js` for STORAGE_MODE=cloud and preview only for memory mode. Its normal ports are 5000/3000, distinct from the currently running verification ports.
- `npm run dev:preview` intentionally forces memory mode. **Do not use it when checking Atlas persistence.**

Example cloud development start from backend (use the existing private .env):

```powershell
$env:PORT='5216'
$env:HOST='127.0.0.1'
$env:STORAGE_MODE='cloud'
$env:LOCAL_DEMO_MODE='false'
$env:HOSTED_PREVIEW='false'
$env:CORS_ORIGIN='http://127.0.0.1:3216'
npm.cmd run build
node dist/server.js
```

## 5. AI configuration and actual limitations

- Primary provider: OpenRouter via AI_* settings in `.env`.
- Last configured primary model: `nvidia/nemotron-3.5-lightning:free`.
- Explicit fallback: `AI_FREELLM_FALLBACK_ENABLED=true`.
- FreeLLM Desktop endpoint: `http://127.0.0.1:31415/v1`.
- Existing private key is in `FREELLMAPI_API_KEY`; no key needs to be pasted into chat.
- Current fallback model: `mistral-small-3.2-24b`.
- `FREELLMAPI_USE_TOOLS=false` uses JSON compatibility mode; schemas/citations/service validation still apply.
- Optional `FREELLMAPI_REASONING_EFFORT` uses native `reasoning_effort`, separately from OpenRouter's reasoning object.
- Fallback is implemented and a real connection test returned FreeLLM/Mistral successfully. However **full fresh research still encounters provider quota/incomplete/upstream errors**. Changing batch size does not guarantee a provider has available quota.
- Providers have independent cooldowns. Credentials are never borrowed across providers. Responses retain the actual model.
- Advertised tool support was unreliable. Tool rejections can retry once as JSON; quota errors do not trigger that retry.
- Encoded feed URLs/hashes are omitted from AI prompts to reduce context; full links remain in stored evidence. Discovery output budget is 2000 tokens, company assessment 4000.
- Render cannot call this computer's loopback address. A hosted fallback requires a reachable secured router/provider. No local router was publicly exposed.

## 6. Prospecting implementation and latest data

Main files:

- `backend/src/prospecting/{contracts,store,research,service,publish}.ts`.
- `backend/src/routes/prospecting.routes.ts`.
- `backend/src/scripts/prospecting-worker.ts`.
- `frontend/src/pages/RealLeadRanking.tsx`.
- `docs/live-prospecting.md`.

Behaviour:

- Normal Lead Ranking uses `/api/v1/prospecting`, not the synthetic ranking fixture.
- Industry/competition-track selector removed; all industries eligible within selected markets.
- Candidates per run: **1–40, default 3**. Current cloud settings: Singapore, 240 minutes, automatic scheduling paused, maxCandidates 3.
- Worker discovers candidates, then researches one per step. Mongo job state has atomic leases/token fencing.
- Reports appear progressively. Only supported opportunities enter ranked results. Retrieved reports remain inspectable when AI or identity checks fail.
- No customer relationship, buyer identity, budget or purchase intent is inferred without account evidence.
- Failed runs retain the last successful ranked list and original dates.
- New `publishProspect` shares model-supported, correctly cited service hypotheses with the sales worklist/dashboard. It excludes source-only or unverified recommendations. A handoff error preserves the completed report and adds a retry warning. **There is not yet a durable automatic outbox for retrying failed handoffs.**

### Saved real report imported into Atlas

- Company: **Pall Corporation**, entity `Q1532489`.
- Research ID: `research-d21a51fa-f31d-462d-bd3d-76e2fe2159b3`.
- Original research timestamp: `2026-11-15T15:14:44.048Z`.
- Actual original AI model: `nvidia/nemotron-3.5-lightning:free`.
- Five real source records; one supported connectivity hypothesis.
- Imported from an actual previously completed report, revalidated against current catalogue, saved to Atlas and graph-sync queue. **It is a saved report, not a newly generated result.**
- Cloud business catalogue was missing the facility-discovery terms already implemented locally. Existing settings were preserved; business-connectivity signal/discovery rules were merged from the current structured catalogue. Active catalogue is now version **2**. The revalidated recommendation passed.
- A sales handoff for this validated report was explicitly published, so dashboard qualification counts can reflect it.
- One-off migration commands were run in the prior chat; no reusable report-import UI/CLI was implemented. Cloud data is the source now; do not rely on inaccessible previous-chat files.

### Latest three-company run

- Run ID: `2f50fc61-0cea-49fd-8848-539840a7d274`.
- Finished/failed after processing **3 of 3**; validated Pall ranking retained.
- Revolut: real sources saved, AI incomplete due to FreeLLM rate limit.
- P&C Global: sources saved; legal identity unverified.
- Sumitomo Mitsui Banking Corporation Singapore Branch: sources saved; legal identity unverified.
- Do not relabel these three as fully AI-qualified opportunities.
- Existing cloud research also includes Deloitte and Infosys Consulting snapshots. Graph filtering can show a small latest snapshot; this does not mean all graph nodes disappeared.

## 7. Important gaps and the next implementation priorities

**First actions for the new chat:**

1. Read this file, `docs/live-prospecting.md`, Git status, root .env locally (privately), and applicable AGENTS.md files.
2. Restart the cloud backend to load the latest handoff code. Check health says cloud / mongodb up / neo4j up. Verify saved Pall report and graph survive restart.
3. Open Lead Ranking, cached Pall details and Knowledge Graph in the local browser. Verify current API data rather than stale frontend memory.
4. Check dashboard/worklist counts after the real qualification handoff. Some counts legitimately remain zero because no actual outreach/replies/meetings have occurred.
5. Continue farming and the account/service/next-action worklist using DB-backed records. This was NOT completed in the last turn.

Final target flow: company/context → evidence → proposed Singtel service → Pursue/Nurture/Resolve/Research → human-approved sales action → feedback/outcome.

Remaining work:

- Complete a coherent farming view with installed-service coverage, potential gaps, renewal context and unresolved service cases. Existing CRM/technical-gate workflows are seeded/reference implementations, not verified live Singtel CRM integrations.
- Add recommendation acceptance/rejection/correction feedback and actual outcome metrics.
- Connect company lists with research identities consistently. The legacy `companies` collection was empty at the last check, while research profiles existed. Do not fill required country/industry/stage fields with invented facts just to populate a table.
- Normal graph shows company → research → event → source. Do not claim it already contains every contact, contract or service relationship.
- UI wording cleanup is only partially done. The exact unwanted “No service hypothesis has passed...” sentence was replaced with a useful discovery instruction. Many demo/prototype strings elsewhere still exist. Present representative CRM provenance clearly without plastering warnings on every card.
- Email workflow supports drafts/approval/tracking, but delivery provider is mocked. It must not claim real email delivery.
- Reliable hosted scheduling is NOT activated. A sleeping Render web service alone cannot guarantee four-hour execution. Code supports a worker or an authenticated frequent POST `/api/v1/prospecting/wake` using PROSPECTING_WAKE_SECRET; no external scheduler has been provisioned.
- The 35-source research inventory is a source plan. Automatic connectors are limited; ACRA/tenders/careers and other planned/manual sources are not all connected.
- Refresh/reuse should preserve original timestamps and catalogue version. A complete TTL/version-aware research cache and durable handoff-retry outbox are useful next improvements.
- Validate fresh AI output when provider capacity exists; do not claim quota problems are fixed merely because a connection test works.
- Release changes only after user approves a push/deployment.

## 8. Verification already completed

Latest backend regression after cloud repair:

- TypeScript build: passed.
- CJS tests: **78 passed**.
- TypeScript tests: **66 passed**.
- Desktop launcher syntax and Git whitespace checks: passed.
- Previously in this continuation: frontend production build and 3 live-prospecting browser tests passed. Full 9-test browser suite passed in the preceding work; it has not been rerun after the latest cloud repair.
- Live Atlas connection: verified after correct URI, resolver and approved local IP rule.
- Live Aura connection and actual home database query: verified.
- Cloud API health: verified both up.
- Saved Pall report validated and persisted; fresh 3-company source reports persisted.

Useful commands (PowerShell, Windows):

```powershell
# backend directory
npm.cmd run build
npm.cmd run test:prospecting
node --test tests/dns.test.cjs
node -r ts-node/register/transpile-only --test test/prospecting-publish.test.ts

# frontend directory
npm.cmd run build
npm.cmd run test:e2e
```

For all backend tests, enumerate `tests/*.test.cjs` and `test/*.test.ts` with PowerShell Get-ChildItem, then pass their full paths to node --test (TS uses ts-node/register/transpile-only).

Playwright test servers: 5010/3010, isolated memory preview. Installed Edge is selected on Windows. `PW_REUSE_SERVERS=true` is opt-in when appropriate. These test servers are different from cloud verification 5216/3216.

## 9. Source documents and optional prior artifacts

User documents are in `C:\Users\lenovo\Downloads`:

- `-Ext- SIH 2026 Industry Track Problem Statements.pdf`
- `Singtel_Solution_Options_Team_Discussion.pdf`
- `Singtel_Team_Leader_Problem_Statement_Briefing.pdf`
- `SIH_SingtelResearch.docx`
- `enterprise-telecom-seed.zip` (representative CRM-like data; review/import carefully)

Optional previous-chat outputs: `C:\Users\lenovo\Documents\Codex\2026-10-29\se\outputs`:

- `SIH_SingtelResearch-extracted.txt`
- `fresh-search-verification.md` (older provider tests; some counts/status superseded here)
- `prospect-live-verified.json` (original completed Pall report)
- `cloud-repair-cjs-tests.log`, `cloud-repair-ts-tests.log`
- `before-cloud-switch-research.json` (preserved prior memory-state API response)

If these artifacts are unavailable in the new chat, continue from the codebase and cloud records. Do not reconstruct fake report content to replace missing artifacts.

## 10. Final scope statement

Cloud connectivity and persistence are repaired. The app has real stored research, a supported saved recommendation, an evidence graph and small research batches. The **entire final product is not finished**: farming integration, coherent DB-backed account views, feedback, real delivery, hosted scheduling and dependable fresh AI analysis still require work. Keep this distinction clear while finishing the product.
