# PayPal and AG Grid integration

The existing AI planner, generator and independent answer reviewer remain the learning engine. PayPal funds those activities through one-time credit packs. AG Grid Community supplies the workspace; no Enterprise license is required.

## Configure PayPal

1. Create a REST application in the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox). Use separate sandbox business (merchant) and personal (buyer) accounts.
2. Set backend-only configuration in the ignored `.env` or your deployment secret manager:

   ```dotenv
   PAYPAL_ENABLED=true
   PAYPAL_ENVIRONMENT=sandbox
   PAYPAL_CLIENT_ID=your-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-sandbox-secret
   PAYPAL_WEBHOOK_ID=your-webhook-id
   APP_ORIGIN=https://your-public-app-origin.example
   ```

   `APP_ORIGIN` is the exact origin without a path or trailing slash. Sandbox localhost testing permits `http://localhost:5173` or `http://127.0.0.1:5173`. PayPal webhooks still need a publicly reachable HTTPS server/tunnel. A hosted app must use its public HTTPS origin. Browser builds need no PayPal credentials. Compose forwards these six runtime settings.
3. Register `https://your-public-app-origin.example/api/payments/webhook` on that **same PayPal app and environment**. Subscribe to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and `PAYMENT.CAPTURE.REVERSED`. Copy the webhook ID into configuration. Forward the signature headers unchanged at your proxy. Monitor PayPal webhook delivery failures and resend failed events after an outage.
4. Restart the API. Open **AI Learning Journey → Learning credits & payments**. Buy a pack with a sandbox personal buyer, approve payment on PayPal, and return to the app. The return automatically requests server capture. If navigation was interrupted, use **Check payment** or **Resume checkout** in history.
5. Confirm credits were granted once. Refresh and check the payment again; the balance must stay unchanged. Generate a quiz to consume one credit, complete it in the grid and view explanations/analytics.
6. Refund a sandbox capture from the merchant dashboard. Confirm webhook delivery and that the pack becomes `REVERSED`. Replayed events must not change the balance again. Refund resources without an order ID are resolved through their capture reference using a fixed PayPal API endpoint.

`PAYPAL_ENABLED=false` preserves the existing free AI workflow and disables checkout. When enabled, missing credentials, webhook ID or origin stop API startup. Invalid environments/origins are rejected. Set `PAYPAL_ENVIRONMENT=live` only with live credentials, live webhook registration and an HTTPS origin after sandbox verification. Credentials stay on the server; the browser redirects to PayPal-hosted approval, so this integration does not load the PayPal JavaScript SDK.

## Product and accounting policy

- Each account receives 3 initial complimentary credits when billing is enabled. A separate plan costs 1 credit. A quiz with its learning plan and answer review costs 1 credit. Revisiting/reviewing a quiz and classic trivia are free.
- Starter: 10 credits for USD 5.00. Explorer: 30 credits for USD 12.00. Prices, currency and grants come exclusively from the server catalog in `server/services/paypal.js`; the browser cannot set them. These initial catalog prices are editable product choices.
- Packs are one-time purchases, with no automatic renewal. Refunds are handled by the merchant through PayPal; the app does not expose a customer refund API. Provide your actual support contact and refund policy before taking live payments.
- Any partial/full refund or reversal revokes the whole pack. If credits were spent, the balance can become negative; further generation is blocked until the balance is positive. This conservative policy is intentional and must be reflected in your customer terms.
- A failed AI request releases its reserved credit. Successful content is accessible through the saved library even if the final HTTP response is lost. Network/client timeouts do not roll back a completed activity.

## Backend guarantees and recovery

Authenticated identity is always the verified Firebase UID. Payment prices and pack credits are persisted before provider requests. The browser supplies a UUID checkout key and retains it in session storage across retries. PayPal create/capture calls use stable, UID-scoped idempotency keys. Capture checks order identity, intent, UID, invoice, currency and amount before charging, then verifies the capture before granting anything. Pending captures grant no credits. A callback URL alone is never proof of payment.

Firestore transactions apply each payment grant, refund and credit release once. Completion and refund callbacks can race; a reversed purchase cannot be granted again. Every webhook is checked with PayPal's signature verification API before processing. No browser can directly read/write credit, purchase, answer-key or reservation collections under the existing Firestore rules.

Stored under `learningUsers/{uid}`:

```text
purchases/{checkoutUUID}       immutable pack snapshot, order/approval link, capture and status
billing/wallet                current balance (implicit initial balance is 3)
creditReservations/{UUID}     RESERVED → CONSUMED or RELEASED
executions/{sameUUID}         corresponding AI execution when billing is active
```

No destructive migration or new composite Firestore index is required. Orders created while billing is disabled cannot be bought through the UI; disabling billing leaves history available and stops provider operations. Keep billing enabled until pending live orders have settled before intentionally reverting to free AI access.

The existing generation process is synchronous and has a bounded AI deadline. **A process crash can leave a credit reservation unresolved.** Inspect old `RESERVED` records against the execution with the same UUID and saved content. Once the originating process is stopped, use `npm run recover:credit -- <uid> <reservationUUID>` for a read-only diagnosis. Use `--apply` to consume a completed execution's reservation or release a failed/missing execution's reservation after reviewing the diagnosis. A running execution is never automatically refunded. This avoids granting credits while work may still be in progress. Use a durable job queue/lease system before supporting multiple API workers or unattended recovery at scale.

The app's existing per-process generation lock and rate limits remain. Run one API process initially. Back up Firestore, monitor API errors and PayPal delivery failures, and retain order/capture IDs for support and reconciliation. Provider OAuth tokens are cached only in server memory and refresh before expiry. Provider failures return safe messages without raw response data or credentials.

## API

All except the webhook require `Authorization: Bearer <Firebase ID token>`.

| Route | Behavior |
| --- | --- |
| `GET /api/payments/account` | Enabled/environment, server catalog, own balance, latest 50 own purchases |
| `POST /api/payments/orders` | Strict `{id: UUID, packId: "starter" or "explorer"}`; creates/reuses checkout |
| `POST /api/payments/orders/:id/capture` | Verify/capture/reconcile an own purchase; repeatable without duplicate grants |
| `POST /api/payments/webhook` | Public transport; PayPal signature required; bounded JSON body |

## Grid coverage

AG Grid renders interests, subjects, Qloo search and selected favorites, related discoveries, execution steps, AI quiz questions and answer review, subject/difficulty performance, progress, recommendations, plans, the saved quiz library, learning packs, payment history, classic quiz options and classic final answer review.

Listings support sorting, column filtering/resizing, quick search, and pagination above 10 rows. CSV export follows filters and prefixes spreadsheet formula triggers. Interactive quiz/preference grids omit export/search controls where those would interfere with completing the task. Native labeled inputs inside custom cells keep answer selection familiar. Answer state is stored outside grid sorting; stable row keys and unchanged row objects preserve it across refreshes. Mobile layouts scroll inside each grid. Navigation, authentication and quiz configuration remain normal form controls.

## Verification and launch status

```sh
npm test
npm run test:emulator
npm run test:browser
npm run build
npm run test:production
npm run format:check
npm run audit:production
```

Unit/HTTP tests cover authentication, strict price inputs, ownership, pending/mismatched payments, capture retries, webhook signatures, duplicate/out-of-order refund events and generation credit release. Real Firestore emulator tests exercise concurrent grants/spending/refunds. Desktop/mobile browser tests use fixtures, not PayPal money movement. A successful build or fixture test does not verify merchant credentials, buyer approval, real webhook delivery or a deployed payment flow. Perform the sandbox procedure above before launch; no live payment is executed by this change.

For the hackathon demo, show grid discovery → PayPal sandbox purchase → AI quiz generation → grid answer review and adaptive analytics → payment history. The hackathon requires meaningful PayPal and AI integration plus runnable source/demo instructions; see the [challenge page](https://paypalaihackathon.devpost.com/). Prepare the required public repository license and under-three-minute demo video before submission.

Contracts checked against [PayPal Orders v2](https://developer.paypal.com/api/orders/v2), [PayPal webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/), and [AG Grid React cell components](https://www.ag-grid.com/react-data-grid/component-cell-renderer/).
