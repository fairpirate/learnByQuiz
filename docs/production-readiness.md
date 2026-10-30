# Production verification status

**Firebase has been repaired and fully verified live.** The remaining release blocker is LLM API credit, so the complete AI workflow is not yet certified. Current Firebase results are in [firebase-verification.json](firebase-verification.json). Earlier [release-verification.json](release-verification.json) and [live-readiness.json](live-readiness.json) retain the original failed-run timestamps; their Firebase failures were subsequently resolved. Reports contain status metadata only, no credentials or Qloo payloads.

## Latest verified coverage

| Area | Result |
| --- | --- |
| Backend/unit/HTTP regressions | Passed; includes provider billing/auth/rate failures, storage failures, malformed/oversized requests, ownership, answer validation, analytics and prototype-safe topic aggregation |
| Real Firestore emulator | Passed: persisted profiles, cross-user isolation, concurrent idempotent grading and cleanup |
| Firestore security rules in the official emulator | Passed: anonymous users, owners and other users cannot directly read/write the new private collections |
| Desktop/mobile UI | Passed: personalized workflow and preserved classic quiz regression tests; external services mocked only in these browser tests |
| Live Qloo | Passed: all 10 application search categories, all 10 Insights categories, cache reuse, fuzzy unmatched-query handling and invalid credentials; 23 subcases, 24 Node test results including their parent |
| Production frontend build | Passed; route split retained, existing entry bundle size advisory remains |
| Formatting/diff checks | Passed |
| Dependency audit | No reported vulnerabilities after adding official Firebase rules testing |
| Live Firebase Auth | Passed: actual Email/Password sign-in, ID-token verification, invalid-token rejection and revocation enforcement |
| Live Firestore | Passed: profile CRUD, owner isolation, saved quizzes, concurrent idempotent grading, dashboard persistence, deployed read/write restrictions and cleanup |
| Live LLM function calling | Failed: configured provider returns exhausted credit/quota |
| Full live quiz matrix | Blocked until live dependencies pass; no test accounts were created |
| Docker image execution | Not verified: the local Docker daemon is not running |

Both the emulator and the live Firebase suite pass. Actual anonymous and authenticated direct reads/writes were denied by deployed Firestore rules. Temporary test users and their isolated records were removed successfully. Quiz grading used synthetic test-only questions; it does not establish live LLM quiz generation.

## Exact remaining configuration work

The app/browser and updated service-account JSON now all target `learnbyquiz-c295d`. The previous cross-project access failures are resolved. Firebase Authentication, Firestore, and deployed data-access restrictions were verified through real provider calls and the application's API.

For the LLM, ensure the account/project owning the exact `LLM_API_KEY` in `.env` has available API credit, or replace it with a funded key. The configured model is retained. The app now distinguishes exhausted billing from temporary throttling; it does not keep retrying a billing failure.

Email/Password sign-in, the default Firestore database, and deployed private data-access rules now pass. Preserve these settings when deploying.

## Reproduce the release verification

Prerequisites: Node 22.18+, Java 21, Firebase CLI, Playwright Chromium and complete backend configuration.

```sh
npm ci
npx playwright install chromium
npm run test:live:all
```

This runs backend tests, an isolated `demo-learnbyquiz` Firestore emulator, desktop/mobile UI regressions, the production build, formatting, the live Qloo category matrix, and live dependency probes. Only after **every prerequisite passes** does it run `test:live:fullstack`. Failed configuration/dependency probes fail the command; no skipped live test is counted as a pass.

The cloud suite uses real Firebase Email/Password sign-in and revoked-token checks, real Firestore persistence, actual Qloo calls and the configured LLM. It covers profile create/edit/delete, cross-user access denial, live browser-read restrictions, plan-only generation, multiple-choice and boolean quizzes at easy/medium/hard, answer-key redaction, server start timing, concurrent grading/idempotency, saved reviews, dashboard persistence, revision recommendations and adaptive difficulty.

It creates two uniquely named test accounts, writes only under their UIDs, and removes their records/accounts in `finally`. A cleanup failure fails the suite. Do not run it with a production credential that is deliberately limited to user-read access; use an appropriately scoped verification credential for the temporary-account lifecycle.

Commands can also run separately:

```sh
npm run verify:live           # Four strict dependency probes and a redacted report
npm run test:live:qloo        # All app categories, bounded live requests
npm run test:live:firebase    # Real Firebase checks, independent of LLM billing
npm run test:live:fullstack   # Real cloud full workflow; creates/cleans isolated test users
npm run test:emulator        # No production credentials passed to Firebase CLI
npm run test:release         # Local regression/build gates only
```

The initial production deployment remains one Node API process. Shared rate-limit storage, a durable execution queue and automatic recovery after process loss are not implemented; these remain prerequisites for horizontal scaling. Graceful shutdown now allows up to 250 seconds for active bounded generation requests. Configure an equivalent termination grace period and ingress timeout on the chosen host. No deployment or cloud IAM changes were performed by this verification.
