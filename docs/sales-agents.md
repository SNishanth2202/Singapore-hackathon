# Sales Communication Agents

The sales workflow is an Express backend feature under /api/v1/sales. It uses the append-only SalesActivity ledger shared with Discovery. The React Sales Outreach view is at /sales/:companyId.

## Data flow

1. Discovery research keeps source IDs, URLs, dates, excerpts and verification labels. The ranking import creates stable DISC-* opportunity IDs and records the same candidates in Sales as QUALIFIED hypotheses.
2. Company Context combines the research snapshot, qualification hypotheses, customer-confirmed reply facts and the versioned Singtel business catalogue.
3. A salesperson records a contact source and reviewed outreach basis. Personalised Outreach creates evidence-linked copy. In the manual workflow a human reviews and approves every outbound email. Companies with AI Management enabled are the exception: see [ai-management.md](ai-management.md).
4. Inbound replies use the normalized webhook contract or local synthetic simulation. Reply Understanding classifies intent and evidence, flags instruction-like content, and routes complex cases to an intervention. Contextual Response creates a review draft. Follow-up eligibility checks replies, opt-outs, open interventions and contact limits.
5. Customer-confirmed requirements are stored as FEEDBACK_CAPTURED and OPPORTUNITY_UPDATED events. When connected, Neo4j stores a requirement linked to its source interaction. A Qualification consumer can poll GET /api/v1/sales/qualification-feedback; eventId is the idempotency key. Each item carries the opportunity ID, requirement and source message/evidence IDs.

Lead Ranking imports Discovery candidates through the existing shared handoff. Customer reply facts are not applied to ranking scores because the reducer has no customer-requirement event and the queue uses an isolated JSON store. Adding ranking effects needs a reviewed reducer contract and privacy decision for customer email content. The feedback feed is the connection point for the separate Qualification Agent without silently changing scores.

## Routes

All paths use the /api/v1 prefix.

- GET /sales/companies — discovered accounts.
- GET /sales/companies/:companyId — events, company brief, requirements, service matches and evidence.
- POST /sales/companies/:companyId/select and /contacts — select an account and record a reviewed contact.
- POST /sales/companies/:companyId/drafts — create an initial draft.
- POST /sales/companies/:companyId/drafts/:draftId/approve or /reject — review the draft.
- POST /sales/companies/:companyId/drafts/:draftId/send — provider acceptance after approval; delivery is unconfirmed.
- POST /sales/companies/:companyId/replies — local or hosted synthetic reply simulation; disabled on a normal production deployment.
- POST /sales/webhooks/inbound — normalized provider adapter; requires x-sales-webhook-secret, provider message and thread IDs, sender email and plain-text body. internetMessageId is optional.
- GET /sales/qualification-feedback — poll customer-confirmed facts for Qualification.
- GET /sales/followups, POST /sales/companies/:companyId/followups and POST /sales/followups/run-due — inspect, schedule and process follow-up drafts.
- GET /sales/interventions and PATCH /sales/companies/:companyId/interventions/:id — review human work.
- GET /sales/drafts — drafts waiting for approval.

## Configuration and provider setup

These are backend-only values. Never prefix provider credentials with VITE_.

    SALES_EMAIL_PROVIDER=mock
    SALES_FOLLOWUP_DELAY_DAYS=5
    SALES_MAX_FOLLOWUPS=2
    SALES_API_TOKEN=<at-least-32-random-characters>
    SALES_EMAIL_WEBHOOK_SECRET=<independent-random-secret>

For Gmail set SALES_EMAIL_PROVIDER=gmail, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN. The OAuth grant must allow sending and the metadata/thread operations used by the adapter.

For Microsoft Graph set SALES_EMAIL_PROVIDER=microsoft, MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and MICROSOFT_REFRESH_TOKEN. The delegated grant needs Mail.Send and Mail.ReadWrite. Refresh-token renewal and revocation are the tenant administrator's responsibility.

mock is for local tests and synthetic preview. Normal production refuses mock delivery. Providers report acceptance separately from inbox delivery. A timeout after possible provider acceptance is unsafe to retry until an operator reconciles the mailbox.

The inbound route is a normalized adapter, not an automatic Gmail Pub/Sub or Graph subscription. Configure provider notifications or an integration relay to verify provider signatures, map thread/message IDs and call this route. Requiring a thread ID avoids attaching a shared sender address to the wrong account. The webhook secret authenticates the relay.

## Local demo and checks

Open a company from Sales Outreach, select it, add a reviewed synthetic contact, create and approve a draft, then send through the mock provider. Paste a synthetic reply to inspect classification, saved customer requirements, a response draft and intervention. Manual follow-up processing creates an approval-required draft and never sends automatically. AI-managed companies use the AI Management follow-up engine instead.

Run npm run test:sales in backend. Regression checks are npm run test:ranking, npm run test:research and npm run test:deployment in backend, plus npm run build in frontend.

## Security and limits

- Production Sales routes use a shared bearer token; the inbound webhook uses a separate secret. The app has no user login or role system, and the React client does not inject the bearer token. Production UI use needs the organization's authenticated API gateway/SSO integration. Do not place SALES_API_TOKEN in a frontend build.
- Provider refresh tokens stay on the backend. Interactive OAuth consent and provider notification subscription management are not included.
- Mongo activity is the source of truth; Neo4j is a secondary requirement graph. Local mode uses process memory.
- Model output is schema-checked and falls back to grounded templates. Confidence is not a calibrated probability. Human approval remains required for every outbound draft in the manual workflow. Autonomous sending is limited to companies where a salesperson enabled AI Management, and passes the policy checks described in ai-management.md.
- Public signals and qualification matches remain hypotheses until a customer confirms a need. The module does not infer price, a contract promise, technical guarantee or buying deadline, and it does not create calendar meetings.