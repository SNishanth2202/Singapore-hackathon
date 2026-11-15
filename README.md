# Singtel Scout 🚀

> **Singtel Hackathon Project** — AI-powered enterprise intelligence platform that identifies and surfaces business opportunities across the APAC region.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Local Development](#local-development)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Seed Data](#seed-data)
- [Project Structure](#project-structure)

---

## Overview

Singtel Scout aggregates public signals about companies (funding rounds, hiring trends, tech adoption, partnerships) and uses a knowledge graph to surface high-priority sales and partnership opportunities for Singtel's enterprise teams.

**Tech Stack**

| Layer | Technology |
|-------|-----------|
| Backend | Node.js · Express · TypeScript |
| Primary DB | MongoDB (Mongoose) |
| Graph DB | Neo4j |
| Validation | Zod |
| Logging | Winston |
| Container | Docker / Docker Compose |

---

## Architecture

```
+---------------------------------------------------------+
|                     Frontend (React)                    |
+---------------------+-----------------------------------+
                      | HTTP  /api/v1
+---------------------v-----------------------------------+
|               Express API (backend:5000)                |
|  Routes -> Controllers -> Repositories -> Models        |
+------------+------------------------+-------------------+
             |                        |
  +----------v---------+   +-----------v-----------+
  |  MongoDB :27017    |   |  Neo4j      :7687     |
  |  (Mongoose)        |   |  (Graph DB)           |
  +--------------------+   +-----------------------+
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) >= 24
- [Node.js](https://nodejs.org/) >= 20 (for local dev)
- [pnpm](https://pnpm.io/) >= 9 (`npm i -g pnpm`)

---

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url>
cd Singapore-hackathon

# 2. Create your .env file
cp .env.example .env
# Edit .env -- set NEO4J_PASSWORD and JWT_SECRET at minimum

# 3. Start all services
docker compose up --build -d

# 4. Check health
curl http://localhost:5000/api/v1/health
```

Services will be available at:
- **Backend API**: http://localhost:5000
- **Neo4j Browser**: http://localhost:7474
- **Frontend**: http://localhost:3000

---

## Local Development

```bash
# Install backend dependencies
cd backend
pnpm install

# Start MongoDB + Neo4j only via Docker
docker compose up mongodb neo4j -d

# Run dev server (hot-reload)
pnpm run dev

# Build TypeScript
pnpm run build

# Seed sample data
pnpm run seed
```

---

## API Reference

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Overall health + all services |
| GET | `/api/v1/health/mongodb` | MongoDB latency check |
| GET | `/api/v1/health/neo4j` | Neo4j latency check |

### Companies

| Method | Endpoint | Query Params |
|--------|----------|-------------|
| GET | `/api/v1/companies` | `country`, `industry`, `stage`, `search`, `page`, `limit` |
| GET | `/api/v1/companies/:id` | -- |

### Opportunities

| Method | Endpoint | Query Params |
|--------|----------|-------------|
| GET | `/api/v1/opportunities` | `status`, `priority`, `page`, `limit` |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics/overview` | Dashboard KPIs |

---

## Environment Variables

See [.env.example](.env.example) for a full list with descriptions.

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `NEO4J_URI` | Yes | Neo4j Bolt URI |
| `NEO4J_USERNAME` | Yes | Neo4j username |
| `NEO4J_PASSWORD` | Yes | Neo4j password |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `PORT` | No | API port (default 5000) |
| `CORS_ORIGIN` | No | Allowed CORS origin |

---

## Seed Data

```bash
cd backend
pnpm run seed
```

Inserts **5 fictional sample companies** (clearly labelled) with associated opportunities and intelligence signals into both MongoDB and Neo4j. **This data is not real.**

---

## Project Structure

```
Singapore-hackathon/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app.ts
│       ├── server.ts
│       ├── config/
│       ├── controllers/
│       ├── integrations/
│       │   ├── mongodb/
│       │   └── neo4j/
│       ├── middleware/
│       ├── models/
│       ├── repositories/
│       ├── routes/
│       ├── scripts/
│       │   └── seed.ts
│       ├── utils/
│       └── validators/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── components/
        │   ├── charts/
        │   ├── layout/
        │   └── ui/
        ├── context/
        ├── hooks/
        ├── layouts/
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── CompanyIntelligence.tsx
        │   ├── CompanyProfile.tsx
        │   ├── KnowledgeGraph.tsx
        │   ├── OpportunityIntelligence.tsx
        │   └── Settings.tsx
        ├── services/
        └── utils/
```

---

## Frontend Development

```bash
cd frontend
npm install # or pnpm install
npm run dev # runs Vite on http://localhost:3000 with API proxy to port 5000
npm run build # TypeScript compilation & optimized production bundle
```

---

## License

MIT -- built for the Singtel Hackathon 2026.


## Local FreeLLMAPI connection

Keep FreeLLMAPI Desktop running. The backend reads these values from the project-root `.env` (never commit the key):

```dotenv
FREELLMAPI_BASE_URL=http://127.0.0.1:31415/v1
FREELLMAPI_API_KEY=<your-unified-key>
FREELLMAPI_MODEL=auto
FREELLMAPI_TIMEOUT_MS=45000
```

From `backend`, run:

```powershell
npm ci --ignore-scripts
npm run test:ai
npm run verify:ai
```

`verify:ai` builds the backend, starts the actual Express application on a temporary loopback port, lists models, and runs a short completion through the backend. It closes the test server afterward and does not require MongoDB or Neo4j. This is useful while the databases are not running. It exits with failure if either backend request fails.

With the regular backend running in local development, the diagnostic routes are `GET /api/v1/ai/models` and `POST /api/v1/ai/test`. The POST route uses a fixed short prompt, has a ten-second cooldown, and permits only one test at a time. These routes are disabled in production and reject non-loopback connections and unexpected browser origins. They do not accept arbitrary public prompts.

The reusable client is in `backend/src/integrations/freellmapi/client.ts`. Sourced analysis and session-only review are described below; opportunity and review persistence remain future work. Credentials and upstream error bodies are excluded from API responses.

When the backend runs in Docker, `127.0.0.1` refers to its container. Use a reachable host address (such as `host.docker.internal` on Docker Desktop) in a container-specific `FREELLMAPI_BASE_URL`, and check that the router accepts that connection. Keep the local diagnostic verification on the host; do not expose the router publicly.

Verified local model: `mistral-small-3.2-24b` (served as Mistral-Small-3.2-24B-Instruct-2506). The local `.env` pins this model and a 90-second deadline after automatic routing timed out at 45 seconds. Set `FREELLMAPI_MODEL=auto` to opt back into automatic routing; record the served model when comparing results.


## Visible company-analysis preview

On Windows, open FreeLLMAPI Desktop, then double-click **Start Enterprise Radar.cmd** in the project folder (or the Desktop launcher). It prepares and starts the local backend and website, waits for readiness and opens Company Intelligence. Keep its window open; Ctrl+C stops only the services it started. If the project is already running, it reuses it. This starts the same local public-research/sample-account preview described below. Restart the launcher after backend code changes.

Open two terminals. In `backend`, run `npm run preview:local`. In `frontend`, run `npm run dev -- --host 127.0.0.1 --strictPort`. Visit `http://127.0.0.1:3000/companies/demo-logistics-001` and select **Analyze with AI**. Keep FreeLLMAPI Desktop running.

The explicit local preview uses two fictional company scenarios and does not initialize or modify MongoDB or Neo4j. AI output is live. The profile shows observations with evidence IDs, possible needs, a conditional capability match, discovery questions and unknowns. The no-signal retail case exercises the hold path.

`POST /api/v1/ai/analyze` accepts only `companyId`; the backend loads the matching company context and validates the generated JSON and citation IDs. It does not accept arbitrary company text from the browser. The local-only/origin restrictions of the AI routes apply. In non-demo development mode it reads the existing company and signals from MongoDB. This is a controlled local prototype, not an authenticated production deployment.

The model receives the selected company context through your configured router. Demo data is visibly labelled. Do not use confidential account data without approved provider handling. Existing-ID checks are not proof that every statement is supported: inspect the actual evidence and reasoning. No generated analysis or review is currently persisted, and the session-only review button never sends outreach or creates a CRM record.


## Research by company name

Open Company Intelligence (`/companies`) and use **Start with a company name**. Enter a name such as Infosys. The backend searches Wikidata identities, auto-selects only a unique normalized exact organization-name match, or asks you to select a possible match. It then collects bounded source excerpts and automatically requests a live AI brief.

Sources: Wikidata for identity/website discovery, Wikipedia for background, Google News RSS for dated publisher headlines, and readable public paragraphs from the listed HTTPS company website plus at most one same-domain news page. No search-provider key is required. Wikidata does not cover every company; try a registered name when there is no match. This is a bounded public-research connector, not exhaustive web search or a verified company registry.

Source records carry their URL, source kind, publication date when known, retrieval timestamp and excerpt hash. Snapshots persist under ignored `backend/data/research/`; they can be reopened through `GET /api/v1/ai/research/:id`. Analysis and review remain session-only. Model credentials never enter the frontend. Public company names are sent to the directory/news sources; collected excerpts are sent to your configured AI router when analysis runs.

Routes (local-development access restrictions apply):
- `POST /api/v1/ai/research/search` with `{ "name": "Infosys" }`.
- `POST /api/v1/ai/research` with a selected `{ "entityId": "Q26989" }`.
- `GET /api/v1/ai/research/:id` for the stored public snapshot.
- `POST /api/v1/ai/analyze` with `{ "companyId": "research-<snapshot UUID>" }`.

Headlines are discovery material; full article text is not retrieved. Collection prioritizes company actions over commentary and retains up to twelve headline records. Reports with different wording about the same event are grouped while preserving citations. A publisher byline or market forecast is separated from the company's own operations. Invalid, future and over-120-day-old news dates are excluded. Classification and grouping are heuristic; a headline may still concern a subsidiary, peer or unrelated activity. Website blocks, missing news and unavailable feeds produce visible warnings rather than invented data. No publication date is inferred from a retrieval date. Background-only research produces HOLD and no capability recommendation.

Public-page fetching accepts HTTPS only, checks every resolved address, pins DNS for the request, validates each redirect, blocks local/private/link-local destinations, limits response bytes and deadlines, and never forwards credentials or cookies. Imported text cannot execute scripts or grant tools/permissions. These checks do not guarantee the factual accuracy of source content.

Run `npm run test:research` from backend for the research and AI checks. Engineering references: https://www.wikidata.org/wiki/Wikidata:Data_access ; https://www.mediawiki.org/wiki/API:Search ; https://cheerio.js.org/docs/intro/ ; https://github.com/NaturalIntelligence/fast-xml-parser .

Research relevance checks: each proposed need and service match must cite dated non-profile evidence from its snapshot. Configurable catalogue rules check the evidence for the proposed service, and the evidence policy excludes unrelated legal controversy as a technology justification. Unsupported suggestions are removed with visible warnings; no eligible match returns HOLD. Background text sent to the model is shortened. These heuristic gates reduce observed failure modes; they do not guarantee semantic accuracy or establish buyer intent. Review the source links and discovery questions before using the brief.

## Seller business knowledge

Open **Settings → Business knowledge** to view or edit the structured seller catalogue. Fourteen Singtel enterprise service areas include capabilities, customer problems, buyer roles, discovery questions and official references. Target segments, research markets and business objectives are team settings. Every analysis reads the active configuration, validates service IDs and records the knowledge version. Selecting the seller itself returns HOLD before calling the model.

Changes persist as versioned local configuration; no authentication has been added. The existing local-development boundary applies. See [backend/BUSINESS_KNOWLEDGE.md](backend/BUSINESS_KNOWLEDGE.md) for the schema, API, editing instructions, evidence rules and storage limits. `GET/PUT /api/v1/ai/business-knowledge` supports a future admin interface. Run `npm run test:business` from backend to check the configuration and matching behavior.

Analysis distinguishes a service-related signal from an exploratory event-to-service connection. An acquisition can support a conditional integration question even without exact product phrases. The backend builds factual public-research summaries from the approved event inventory, validates AI hypotheses against service/evidence IDs, and reports why any suggestion was withheld. `DISCOVERY_READY` means ready for a targeted conversation; it does not establish a qualified opportunity. The dashboard explains source limits and customer questions separately instead of using a generic missing-evidence message. The combined checks include regressions for duplicated acquisition coverage, commentary attribution, provider-versus-customer roles and event-based discovery.

## Lead ranking

Lead ranking combines cited public signals with synthetic Salesforce-style CRM and engineering facts.
It ranks each account, buying unit, product/use case and buying window. **OpenAI actively assesses
urgency and confidence**; application code enforces site, technical and deadline requirements.
Open **Lead Ranking** in the app navigation (`/lead-ranking`); `/opportunities` redirects there.

```powershell
npm --prefix backend ci
npm --prefix frontend ci
npm run dev
```

Open http://localhost:3000/lead-ranking. If no OpenAI key is configured, the app opens a popup to enter
one. Alternatively set `OPENAI_API_KEY` in the ignored project-root `.env`; the default ranking model
is `gpt-4.1-mini`, configurable with `OPENAI_MODEL`. Browser-entered keys stay in backend memory for
the session; the browser receives an opaque HttpOnly cookie. Keys are never saved in browser storage
or returned by the API. OpenAI API usage is billed to the key's account. Restarting the server clears
browser key sessions. Company research retains its existing, separate provider settings.

Urgency labels are **Very urgent**, **Urgent**, **Normal priority**, **Low priority** and **Irrelevant**.
The table shows one **confidence percentage**, with no separate numeric priority score. Hover, focus
or tap either urgency or confidence for short evidence-based reasons. Confidence is the model's
assessment of the evidence supporting its urgency judgment, not a calibrated probability of winning
or a scenario frequency. Unbounded decisive evidence shows **Insufficient evidence**. Required actions
remain Pursue, Verify, Resolve, Monitor and Blocked; failed or unknown mandatory gates prevent pursuit.

The worklist opens directly onto the ranked leads. **Reassess leads** requests a fresh model assessment;
unchanged evidence normally reuses the successful result. **Demo checks** opens replay/reset,
connector failure, ambiguous matching, clock changes and an empty list. The initial 15 candidates
become 16 when the cited ETLA trigger is replayed. All buyer dates, contacts, commercial estimates,
service cases and engineering assessments are synthetic. Source/model failures preserve the last
successful result with its time and warning. Before a successful model call, the queue is labelled
Awaiting AI. A healthy empty queue stays empty without a model call.

The local launcher uses the app's memory preview and a separate atomic JSON store under `.local/`
for ranking. The default home page remains the dashboard. No real Salesforce connection is claimed.
The cloud backend retains its existing start entry point; hosted preview file state is temporary.

Verify the module without paid model calls:

```powershell
npm --prefix backend run test:ranking
node --test tools/gebiz-connector.test.mjs
npm --prefix backend run verify:ranking-demo
npm --prefix frontend run test:e2e
```

Browser tests use isolated ports and fixture state. The replay verifier checks the deterministic
reference engine; set `LEAD_RANKING_MODE=rules` before starting the backend to use that offline mode.
Its fixed weights and ten-scenario confidence are reference behavior rather than the live AI assessment.
Both package builds and the existing research/deployment tests also apply.

- [Active LLM architecture, keys and acceptance checks](docs/lead-ranking-llm.md)
- [Implementation plan and acceptance criteria](docs/lead-ranking-plan.md)
- [Data contracts and seeded opportunities](docs/lead-ranking-contracts.md)
- [Public source inventory](docs/lead-ranking-sources.md)
- [Demo script](docs/lead-ranking-demo.md)
- [Verification and operational scope](docs/lead-ranking-delivery.md)

## Sales communication agents

The Sales Outreach workbench connects Discovery context to evidence-linked outreach, reply analysis, customer requirement feedback, interventions and human-approved follow-ups. See docs/sales-agents.md for routes, provider setup, demo steps, checks and integration boundaries.

## AI Company Management

A configurable daily lead queue and a per-company AI Management toggle. Once enabled, the autonomous communication agent sends outreach, answers routine questions from approved information, runs follow-ups and escalates to the Human Attention inbox when a person is needed. See [docs/ai-management.md](docs/ai-management.md) for states, safety rules, APIs, email provider setup and tests.