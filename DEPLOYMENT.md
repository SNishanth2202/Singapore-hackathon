# Render backend and Vercel frontend

Deploy the `priyanshu` branch of the private fork `Priyanshu-10112/Singapore-hackathon`. The upstream branch remains available at `SNishanth2202/Singapore-hackathon`; no merge is needed.

## Backend: Render

Use the free web service described in `render.yaml`, or these equivalent settings:

- Root directory: `backend`
- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health check: `/api/v1/health/ready`
- Runtime: Node 24
- `NODE_ENV=production`, `HOST=0.0.0.0`, `STORAGE_MODE=memory`, `LOCAL_DEMO_MODE=true`, `HOSTED_PREVIEW=true`, `TRUST_PROXY_HOPS=1`

This version deliberately runs without MongoDB or Neo4j. Research snapshots and business knowledge are held temporarily in memory; a restart or redeploy clears them. Sample accounts remain clearly labelled fictional. Keep the AI key in Render environment variables. Never commit `.env` or place credentials in a `VITE_` variable.

Set `CORS_ORIGIN` to the exact Vercel production origin. Multiple explicitly approved origins can be comma-separated. In this preview, readiness checks the temporary-storage configuration and does not require databases.

## AI: OpenRouter

The backend uses `AI_BASE_URL=https://openrouter.ai/api/v1`, `AI_PROTOCOL=chat_completions`, and the key saved as `AI_API_KEY`. The tested free model is `nvidia/nemotron-3.5-lightning:free` with `AI_REASONING_EFFORT=none`. Model availability and account quotas can change. There is no automatic fallback to a paid model.

Existing `FREELLMAPI_*` settings still work locally when no `AI_*` provider is configured. Credentials from different routers are never mixed. Responses-compatible providers can use `AI_PROTOCOL=responses`.

## Frontend: Vercel

- Root directory: `frontend`
- Framework: Vite
- Build: `npm run build`
- Output: `dist`
- Public environment variable: `VITE_API_BASE_URL=https://<actual-render-service>.onrender.com`

Redeploy after changing this variable. `frontend/vercel.json` supports direct links such as `/companies` and `/settings`.

## Verification

Run backend `test:research`, `test:deployment` and `check:deployment`, then the frontend build. After deployment, check readiness, direct frontend links, company research and one real AI analysis. Cloud database checks are not required for this release.

No user login is added. Hosted research and analysis are available with request limits. Model-list diagnostics, test generation and business-configuration edits remain local-only; the hosted catalogue is view-only until administrator access is implemented.

Database integration is deferred to the next version. To enable it later, configure Atlas/Aura credentials, set `STORAGE_MODE=cloud`, `LOCAL_DEMO_MODE=false` and `HOSTED_PREVIEW=false`, and run `verify:cloud`. Research-to-graph synchronisation remains separate unfinished work. Render Free can sleep when idle, so initial requests may take longer.
