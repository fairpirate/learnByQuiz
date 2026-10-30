# Plan review and implementation record

Update, October 31, 2026: The later production-verification pass added a strict release runner, a full cloud test harness and real emulator/rules tests. Firebase permissions were subsequently repaired, and live Auth/Firestore/rules/transaction checks now pass; see [Firebase verification](firebase-verification.json). LLM API billing remains outstanding; see [production readiness](production-readiness.md).

Earlier update, October 31, 2026: Qloo was subsequently verified with live hackathon requests and the new developer guide. See [Qloo verification](qloo-verification.md). Historical skipped-test notes below describe the original implementation run; Firebase/LLM verification remains outstanding.

The proposal fits the product, with several necessary adaptations to the actual repository:

- The original app is React/Vite, Firebase Auth, browser-persisted Zustand quiz state, and Open Trivia DB. It had no server, database models, LLM integration, test suite, or deployment manifests. The upgrade adds these alongside the original routes.
- Qloo entity search resolves real cultural references. Broad learning interests such as space exploration are not treated as invented Qloo entity types. Related entities and available tags come from documented search/Insights responses.
- Firestore preserves the existing Firebase identity provider. Embedded taste entities and derived recommendations avoid unnecessary extra tables. The additive migration records the version without rewriting any legacy data.
- The agent is a bounded orchestrator with structured LLM function calls. An independent answer-review call is implemented, but factual certainty cannot be guaranteed by an LLM alone.
- Adaptive difficulty is based on recorded results. Taste determines examples, not grading or advancement.
- Production source, tests, and deployment instructions are delivered. Credential-dependent verification, cloud resource provisioning, and public hackathon media remain deployment tasks.

## Phase map and changed files

| Phase | Implementation and primary files | Verification / remaining work |
| --- | --- | --- |
| 1. Inspection | Existing `src/`, `package.json`, Firebase config, quiz store, README, repository history/status and configuration inspected | No existing server/schema/deployment found; original flow retained |
| 2. Qloo | `server/services/qloo.js`, `server/tests/qloo.test.js`, `server/tests/qloo.live.js` | Contract/auth/cache/error tests pass; live test skips without credentials |
| 3. Taste profiles | `server/app.js`, `server/schemas.js`, `server/repository.js`, `scripts/migrate.js`, `firestore.rules` | Ownership, validation, canonical Qloo metadata, editing/deletion tested; apply migration/rules with configured Firebase |
| 4. Orchestration | `server/services/agent.js`, `server/services/llm.js`, execution API | Tool-call, failed-review, no-profile/no-discovery, plan-only and trace tests pass; live LLM requires credentials |
| 5. Personalized quizzes | Quiz generation schemas, saved quiz/start/grade API, Journey quiz UI | Multiple choice and boolean validation, grading, answer-key redaction, saved/review flow tested |
| 6. Adaptive learning | `server/services/analytics.js`, dashboard/result API | Accuracy, weak topics, difficulty and idempotent submission tested; analytics window documented |
| 7. Frontend | `src/pages/Journey/Journey.jsx`, `src/api/learning.js`, `src/main.jsx`, `src/index.css`, navigation/home integration | Desktop/mobile learning journey tests pass with test-only external-service fixtures |
| 8. Regression/security | `server/tests/`, `tests/browser/`, `playwright.config.js`, dependency lockfile, existing auth/quiz components | Backend tests, four browser workflows and production build pass; audit clean; actual Firestore adapter test is available but requires emulator |
| 9. Documentation/deployment | `README.md`, `.env.example`, `Dockerfile`, `.dockerignore`, this record | Setup/API/architecture/demo/deployment documented; live demo video and provider verification remain |

Validation was performed in batches as dependent features became executable: backend integration and unit tests, frontend production builds, and desktop/mobile browser regressions. Credential-gated tests are reported separately and are not counted as successful live integration.

## Existing behavior corrected during integration

- Removed password/auth-object console logging and unnecessary promise wrappers.
- Restored the real Firebase session before applying route guards; sign out now signs out Firebase as well as clearing local state.
- Preserved browser quiz persistence for the same signed-in learner and cleared quiz state when identity changes.
- Reset previous answers and timers between classic attempts.
- Kept classic option order stable across timer rerenders and made options keyboard accessible.
- Scored against the actual question count, guarded invalid quiz/finish routes, and added trivia failure/retry states.
- Preserved password characters and made auth errors robust to arbitrary Firebase messages.
- Updated vulnerable dependencies while retaining React 18 and existing application libraries. Firebase app peers are pinned to the Node-compatible Firebase 12 versions; gRPC is overridden to a patched compatible minor version.

## Verification limits

No Qloo/LLM/Admin credentials were supplied. The live Qloo test was explicitly skipped. No Firestore emulator was running; the transactional repository integration test was explicitly skipped. The backend HTTP tests use an in-memory repository only in test code. Browser tests mock external HTTP responses and do not claim live Firebase/provider integration.

No deployment was performed. Configure the services and run the README demo workflow before recording or submitting a live hackathon demo. The initial server is designed for a single process; shared rate limits, locks, and a durable execution queue are documented prerequisites for horizontal scaling and automatic crash recovery.

## Final validation results

- Backend: **18 tests passed**, including the complete mocked HTTP generation/start/submit/dashboard flow, ownership boundaries, canonical Qloo profile metadata, rate limiting, boolean questions, and adaptive planning.
- Browser: **4 workflows passed**, covering personalized learning and classic trivia on desktop Chromium and mobile Chromium.
- Production frontend build passed. Vite reports the existing Firebase/router/application entry chunk above its advisory 500 kB threshold; the Journey route is loaded as a separate chunk.
- Formatting and `git diff --check` passed.
- Locked dependency audit: **0 vulnerabilities reported**.
- Live Qloo and Firestore-emulator tests: **skipped**, with the required configuration documented.
- Desktop/mobile UI screenshots were captured using test fixtures in `docs/screenshots/`; no live integration or video is implied.
