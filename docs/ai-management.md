# AI Company Management

AI Management lets a salesperson hand a company's email conversation to an autonomous agent. Once enabled for a company, the agent sends personalised outreach, answers routine questions from approved Singtel information, runs follow-ups and records everything it learns. It notifies a person only when one is needed (positive interest, meetings, proposals, pricing, complaints, uncertainty, failures).

It extends the existing Sales workflow. It reuses the Discovery research snapshot, the Lead Ranking queue, the Company Context, Personalised Outreach, Reply Understanding, Contextual Response and Follow-up agents, the SalesActivity ledger, the suppression list and the email provider seam. The only new agent is the orchestrator that decides what to do next for each company.

## How a company moves through the system

1. **Daily lead queue.** A backend scheduler runs the existing Lead Ranking snapshot at the configured time and timezone. It selects up to the daily target of unique Discovery companies that pass the minimum score and ranking confidence. It skips companies queued on an earlier day and companies that are already AI-managed. If only 12 companies qualify, the queue has 12. Seeded CRM rows are never queued because they are not real companies.
2. **Enable.** The salesperson switches AI Management on in the Lead Ranking queue, the AI Management page, the company conversation view or the Sales workflow page. Activation checks the following:
   - the company came through Discovery and has an evidence-qualified opportunity and research evidence;
   - a verified contact is recorded with its source and outreach basis;
   - the contact is not suppressed;
   - the jurisdiction is allowed by the configured consent-only list;
   - the salesperson ticks two boxes: one authorises autonomous sending and one confirms the compliance review.

   The authorisation statement, user, time, jurisdiction and basis are stored with the company.
3. **Initial outreach.** The existing outreach agent drafts the email. The orchestrator then runs safety checks immediately before the provider call: confidence threshold, suppression, frequency limits, and a content policy that blocks prices, guarantees, meeting claims, unknown email addresses, placeholders and internal text. Every autonomous email ends with an unsubscribe line. Draft and send IDs are deterministic, so a retried worker cannot send a second copy.
4. **Replies.** The worker polls the provider inbox. The existing normalised webhook can also be used. Each message is matched to exactly one AI-managed company by sender and thread. The agent then classifies the reply with the whole conversation as context and decides what to do:

   | Reply | What the agent does |
   |---|---|
   | Routine question answerable from approved information (service question, request for information, existing provider) | Answers it autonomously, then schedules the next follow-up |
   | Positive interest, specific service request, problems with the current provider | Escalates as `POSITIVE_REPLY` (HIGH) and pauses automation for the company |
   | Meeting, proposal, pricing or negotiation | Escalates with that type (HIGH). It never confirms a meeting or quotes a price. |
   | Complaint | Escalates (CRITICAL) |
   | Technical question, competitor discussion, referral, instruction-like text, low confidence, outside approved knowledge | Escalates as `HUMAN_INTERVENTION` |
   | "Contact me next month" or a future opportunity | Schedules a customer-requested follow-up for that date |
   | Out of office | Moves the next follow-up to after the return date |
   | Not interested | Completes the workflow (`NOT_INTERESTED`) |
   | Unsubscribe | Adds the address to the global suppression list, cancels follow-ups and completes the workflow. Re-activation is refused. |
5. **Follow-ups.** `followupIntervalsDays[i]` is the number of days after the previous email before follow-up *i+1* is sent. After the last follow-up, the agent waits `noResponseCloseDays` and then marks the company `NO_RESPONSE` and `COMPLETED`. No follow-up is sent while any of the following is true:
   - a customer message is unanswered;
   - a salesperson owns an open intervention;
   - the company is paused, escalated, handed over or completed;
   - the contact is suppressed;
   - the frequency limits would be exceeded.
6. **Human handling.** From the Human Attention inbox a salesperson can open the conversation, take ownership (`HUMAN_HANDOVER`; follow-ups cancelled), respond manually in the existing Sales workflow, mark the item resolved, or resolve it and resume AI. These actions also update the matching Sales intervention.

## States

Each company has three independent lifecycles:

- **Automation (`managementState`):** `OFF → ACTIVATING → ACTIVE ⇄ PAUSED / HUMAN_ATTENTION_REQUIRED / HUMAN_HANDOVER → COMPLETED`, plus `ERROR`. Transitions are validated in `backend/src/ai-management/state.ts`.
- **Communication (`communicationState`):** `READY, OUTREACH_SENT, WAITING_FOR_REPLY, FOLLOW_UP_SCHEDULED, CUSTOMER_RESPONDED, NO_RESPONSE, NOT_INTERESTED, UNSUBSCRIBED, COMPLETED, ERROR`.
- **Opportunity:** this remains the existing SalesActivity events (`QUALIFIED`, `MEETING_REQUESTED`, `CONVERTED`, …).

Only `ACTIVE` companies are processed by the worker, and every send re-checks the state immediately before the provider call. Pause, take-over, disable and the emergency stop take effect before the next send. A send that is already in progress completes.

## Company memory and feedback

Each company record keeps the following:

- a conversation summary;
- customer-stated requirements, each with its source message and the catalogue services it maps to (name, alias, or a signal term that satisfies the offering's required and excluded terms);
- questions, answers, objections, existing-provider mentions, buying signals and preferences;
- pending actions;
- a state history.

New requirements are written as `FEEDBACK_CAPTURED` and `OPPORTUNITY_UPDATED` events with the source message attached. The Company Context brief already reads these as `CUSTOMER_CONFIRMED` requirements, alongside, not instead of, the public evidence. They also appear in `GET /sales/qualification-feedback`.

The opportunity score starts from the Lead Ranking score. It changes only on customer-stated evidence:

- +5 for each new requirement that maps to the catalogue, up to +15;
- +10 for a meeting or proposal request;
- +5 for explicit interest.

One reply can move the score by at most 15 points. Every change keeps the previous value and the reason.

When Neo4j is connected, each interaction is linked as `Company → Contact`, `Company → EmailThread → SalesInteraction`, and `Company → Opportunity → Requirement → SingtelService`.

## API (all under `/api/v1/ai-management`)

| Method | Path | Purpose |
|---|---|---|
| GET/PUT | `/settings` | Daily target, schedule, thresholds, follow-up policy, limits, consent-only jurisdictions. PUT uses optimistic versioning. |
| GET | `/daily-runs` · POST `/daily-runs/run` | Run history and manual run. |
| GET | `/companies?scope&status&industry&country&priority&from&to` | Daily queue merged with AI-managed companies. |
| GET | `/companies/:companyId` | Readiness, brief, management record, notifications, authorisation text. |
| POST | `/companies/:companyId/enable` · `/disable` · `/pause` · `/resume` · `/takeover` · `/process` | Controls. `enable` requires `authorizationAcknowledged: true`, `complianceReviewed: true` and `jurisdiction`. |
| GET | `/companies/:companyId/conversations` · `/timeline` | Messages with interpretation and AI decision; full audit timeline. |
| GET | `/notifications` · POST `/notifications/:id/read` · `/acknowledge` · `/resolve` · `/notifications/read-all` | Notification centre and Human Attention inbox (`requiresAction=true&status=UNRESOLVED`). |
| GET | `/follow-ups` · `/analytics` | Scheduled actions and real aggregates. |
| POST | `/emergency-stop` · `/emergency-resume` | Global switch for all autonomous outbound email. |
| POST | `/inbox/poll` · `/worker/run` | Run the inbox check or the worker immediately. |
| POST | `/companies/:companyId/simulate-reply` · `/demo/seed` | Synthetic preview only (mock provider). |

In production these routes require the same `SALES_API_TOKEN` bearer token as the Sales API. The app has no user accounts, so `actor` and `activatedBy` are free-text labels supplied by the client.

## Data (MongoDB)

| Collection | Contents |
|---|---|
| `ai_management_companies` | One record per company (unique `companyId`) with both states, contact, authorisation, next action, memory, score history and state history. Saves use a version field (compare-and-set). |
| `ai_management_settings` | Single settings document, plus the inbox cursor and emergency-stop fields. |
| `ai_management_notifications` | Notification centre. The `notificationId` is deterministic, so a repeated event never creates a duplicate notification. |
| `ai_management_daily_runs` | Daily queue runs and the selected leads. |
| `ai_management_leases` | Per-company and per-job leases, so only one worker acts for a company at a time, even across instances. |
| `sales_activity_events` (existing) | Append-only ledger, extended with `AI_MANAGEMENT_STATE_CHANGED`, `OUTREACH_BLOCKED` and the new reply categories. Messages, threads (`payload.providerThreadId`, now indexed), follow-up schedules, suppression and agent executions live here. |

## Email provider setup

These settings are for the backend environment only. Never prefix them with `VITE_`.

- **Preview (default):** `SALES_EMAIL_PROVIDER=mock`. Outbound messages go to an in-process synthetic outbox and are never delivered. Replies are simulated from the conversation view or with `/simulate-reply`. Synthetic companies, and any hosted preview, refuse to send through a real provider.
- **Gmail:** `SALES_EMAIL_PROVIDER=gmail`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. Create an OAuth client in Google Cloud, grant `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly` for the sending mailbox, and store the refresh token on the server. The worker polls `in:inbox` with a 10-minute overlap and deduplicates by message ID.
- **Microsoft 365:** `SALES_EMAIL_PROVIDER=microsoft`, `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REFRESH_TOKEN`. Register an app in Entra ID with delegated `Mail.Send`, `Mail.ReadWrite`, `Mail.Read` and `offline_access`. The worker polls the Inbox through Graph using immutable IDs.
- **Webhook (optional):** set `SALES_EMAIL_WEBHOOK_SECRET` and have a relay call `POST /api/v1/sales/webhooks/inbound`. It uses the same message IDs as polling, so a message delivered by both paths is processed once.

Providers report acceptance only. Analytics count `providerAccepted` and leave `confirmedDelivered` empty.

## Running and testing

- The worker starts with the backend (`npm run dev` or `npm start`) and ticks every 60 seconds. It runs the daily ranking, the inbox poll and due company actions, independently of any browser.
- In local preview, open **Lead Ranking**, choose **Load 3 synthetic preview companies**, and toggle AI Management on.
- Tests:
  - `npm run test:ai-management` runs the settings tests and 17 end-to-end scenarios in memory, with synthetic companies and simulated email.
  - `AI_TEST_STORAGE=mongo AI_TEST_MONGODB_URI=<replica-set URI> node --test tests/ai-management-e2e.test.cjs` runs the same scenarios against MongoDB.
  - `AI_TEST_MONGODB_URI=<replica-set URI> node --test tests/ai-management-restart.test.cjs` checks state persistence across two separate processes.

  MongoDB must be a replica set (Atlas always is) because the knowledge store uses transactions.

## Limits

- The daily job ranks companies that Discovery has already researched. It does not search the web for new companies by itself.
- Gmail Pub/Sub and Graph change-notification subscriptions are not managed; polling is the reliable path and the webhook accepts a relay.
- Interactive OAuth consent is not built in; refresh tokens are configured by an administrator.
- There is no scheduling integration, so meetings are never confirmed by the AI.
- Compliance is a recorded attestation plus a configurable consent-only jurisdiction list. The system does not determine what the law allows.
- Customer feedback adjusts the AI-management opportunity score and the Sales brief. It does not change the Lead Ranking engine's own scores, because the ranking reducer has no customer-reply event.
- Without a configured LLM, answers to routine questions use approved catalogue capabilities only, and only when every question names a catalogue service. Anything else is escalated.
