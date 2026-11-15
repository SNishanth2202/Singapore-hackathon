# Render backend and Vercel frontend

Deploy the `priyanshu` branch of `SNishanth2202/Singapore-hackathon`. No merge is needed.

## Backend: Render

Use the free web service described in `render.yaml`, or these equivalent settings:

- Root directory: `backend`
- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health check: `/api/v1/health/ready`
- Runtime: Node 24
- `NODE_ENV=production`, `HOST=0.0.0.0`, `STORAGE_MODE=cloud`, `LOCAL_DEMO_MODE=false`, `TRUST_PROXY_HOPS=1`

Set the real Atlas connection string, Aura URI/username/password, and AI key in Render environment variables. Never commit `.env` or place credentials in a `VITE_` variable. Add Render's listed outbound IP ranges to Atlas network access; an allow-all rule is unnecessary.

Set `CORS_ORIGIN` to the exact Vercel production origin. Multiple explicitly approved origins can be comma-separated. The readiness endpoint returns 503 if either database is unavailable.

## AI: OpenRouter

The backend uses `AI_BASE_URL=https://openrouter.ai/api/v1`, `AI_PROTOCOL=chat_completions`, and the key saved as `AI_API_KEY`. `AI_MODEL` pins the selected model. The initial free model is `google/gemma-4-31b-it:free`, verified in the provider's public catalogue during setup. Model availability and account quotas can change. There is no automatic fallback to a paid model.

Existing `FREELLMAPI_*` settings still work locally when no `AI_*` provider is configured. Credentials from different routers are never mixed. Responses-compatible providers can use `AI_PROTOCOL=responses`.

## Frontend: Vercel

- Root directory: `frontend`
- Framework: Vite
- Build: `npm run build`
- Output: `dist`
- Public environment variable: `VITE_API_BASE_URL=https://<actual-render-service>.onrender.com`

Redeploy after changing this variable. `frontend/vercel.json` supports direct links such as `/companies` and `/settings`.

## Verification

Run backend `test:research`, `test:deployment`, `check:deployment`, and `verify:cloud`, then the frontend build. After deployment, check readiness, direct frontend links, company research and one real AI analysis.

No user login is added. Hosted research and analysis are available with request limits. Model-list diagnostics, test generation and business-configuration edits remain local-only; the hosted catalogue is view-only until administrator access is implemented.

Research snapshots and business knowledge use Atlas. The existing Neo4j connection is verified at startup; research-to-graph synchronisation remains a separate unfinished feature. Render Free can sleep when idle, so initial requests may take longer.
