# Enterprise Radar AI 🚀

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

Enterprise Radar AI aggregates public signals about companies (funding rounds, hiring trends, tech adoption, partnerships) and uses a knowledge graph to surface high-priority sales and partnership opportunities for Singtel's enterprise teams.

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
