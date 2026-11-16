# Cloud CRM and sales release

The CRM pages read two explicitly bound existing-customer scenarios, eighteen original source artifacts, forty accepted facts and seven account recommendations. Records are stored in Atlas collections crm_accounts, crm_artifacts, crm_extractions and crm_datasets. The manifest is published last, and the API validates source hashes, quoted evidence and account bindings before showing data. A cloud failure never substitutes unrelated frontend fixtures.

Endpoints: GET /api/v1/crm/accounts, GET /api/v1/crm/accounts/:id and account-scoped original-artifact downloads. The interface is available at /crm. Account graph links retain the explicit graph account ID.

From backend, npm run seed:crm previews counts without writes. Adding -- --write inserts missing immutable records; adding --graph also syncs the accepted graph while preserving a different active Aura generation.

Atlas now also contains twelve company profiles, twelve service opportunities, 141 tagged sales events, eleven AI-management records, six notifications and the sample daily worklist. These remain distinct from the existing-customer CRM scenarios. Aura contains the accepted customer graph with 82 nodes and 223 relationships, plus the twelve sample research projections.

Production uses STORAGE_MODE=cloud and LOCAL_DEMO_MODE=false. The authorised public walkthrough uses HOSTED_PREVIEW=true with SALES_EMAIL_PROVIDER=mock, so sales and simulated replies work with cloud records while messages stay in the server's test outbox. Real-provider authentication requirements remain enabled outside this explicit walkthrough. No real email delivery is claimed.

Pre-release checks: 126 backend tests passed, 78 domain tests passed and 24 browser tests passed; eight optional live-service checks were skipped. An additional production-walkthrough regression was added before release. Both production builds passed. Local MongoDB connections time out on the current network; Render's cloud logs confirm successful Atlas and Aura connections.

The local port-5217 service was refreshed after the old process returned 404 for the new CRM route. Existing research, saved analyses, conversation events and management state were backed up privately and restored. Private settings, session backups and generated screenshots remain excluded from Git.
