# Production verification status

Verified on November 1, 2026. Firebase, all Qloo categories and NVIDIA function
calling pass live dependency checks. The complete live release gate passed, including all six quiz combinations and adaptive generation. Full results are recorded in
[release-verification.json](release-verification.json); dependency and Firebase
results are in [live-readiness.json](live-readiness.json) and
[firebase-verification.json](firebase-verification.json).

## Release coverage

| Area | Result |
| --- | --- |
| Backend/unit/HTTP regressions | 37 tests passed, including bounded repair, rejected-quiz persistence prevention, authentication, ownership, validation and grading |
| Firestore emulator and rules | Passed persistence, concurrent idempotent grading and anonymous/owner/cross-user access denial |
| Desktop/mobile browser workflows | Four tests passed; browser external services are mocked |
| Production build and actual Node entry point | Passed SPA/assets, protected API, caching and graceful shutdown |
| Live Qloo | Passed all 10 Search categories, all 10 Insights categories, cache and invalid credentials |
| Live Firebase | Passed real sign-in, verified/revoked tokens, persistent CRUD, ownership, transactions, deployed rules and cleanup |
| Live NVIDIA function calling | Passed validated named-tool requests |
| Full live quiz matrix | Passed all six difficulty/format cases, adaptive generation, grading, dashboard, revocation and cleanup; 14 test results including their parent |
| Dependency audit | Zero reported vulnerabilities; patched glob override for transitive rimraf |
| Formatting and diff checks | Passed |
| Docker Compose configuration | Validated: only the app, published on 127.0.0.1:13001 |
| Nginx and VPS preflight regressions | Seven checks passed with isolated Nginx 1.30.6 and mocked VPS port/network allocation; actual VPS application pending |
| Docker image execution | Not verified: the local Docker daemon is stopped |

The final cloud suite creates two isolated test users, exercises actual planning,
all six difficulty/format combinations, independent answer review, server-side
grading, persistence, adaptive generation and access boundaries. It removes its
records and accounts in `finally`; cleanup failure fails the suite. It never
counts skipped live tests as success.

## Hardening completed

Tool schemas now declare the server's length/count limits and the exact selected
subject, difficulty and format. The NVIDIA adapter decodes JSON-encoded nested
containers only where the schema requires arrays/objects, then applies the same
strict semantic validator. It never coerces booleans into answer strings or
truncates content. Other malformed responses get one repair attempt within the
original 60-second tool deadline. Billing, authentication and rate-limit failures
are not retried.

A reviewer-rejected quiz gets one revision with feedback and a fresh review.
A second rejection fails without persisting a quiz. Revision steps and review
outcomes are recorded in the execution trace. Provider calls share a 180-second
workflow deadline. AI review still cannot guarantee factual correctness.

Production startup validates backend configuration, ports, real Firebase routing
and built assets. Explicit proxy addresses/CIDRs support correct client limits.
API responses cannot be cached, HTML revalidates, and hashed assets are immutable.
The Docker image adds a process health check; Compose includes restarts, log
rotation, a read-only app filesystem and a 250-second stop grace period. CI runs
the local release gates without cloud credentials.

## Deployment status

The target is **learnbyquiz.spiritedrobot.in** on a single Docker server. The
hostname has been added to Firebase Auth's authorized domains and verified;
existing domains were preserved. The additive schema migration has run.
DNS resolves to `162.35.172.158`, but current public HTTPS presents a certificate
that does not match the hostname. Deployment and public browser verification are
pending server SSH access. See [deployment verification](deployment-verification.json)
and the [Docker deployment runbook](deployment.md).

The Compose package binds only `127.0.0.1:13001` and includes named virtual hosts
for the host's existing Nginx on ports 80/443. A read-only preflight checks port
and network conflicts. HTTP bootstrap, Certbot webroot issuance and TLS configs
are provided separately. No remote containers or unrelated services were changed;
SSH authentication as `root@162.35.172.158` was denied.

Keep one API process initially. Shared rate-limit/lock storage and a durable job
queue are required before horizontal scaling. Process crashes do not resume
running executions. Check the selected provider's production terms and account
limits before serving users.

## Reproduce

Prerequisites: Node 22.18+, Java 21, Firebase CLI, Playwright Chromium and complete
backend configuration.

```sh
npm ci
npx playwright install chromium
npm run test:live:all
```

For separate checks, use `npm test`, `npm run test:emulator`,
`npm run test:browser`, `npm run build`, `npm run test:production`,
`npm run audit:production`, `npm run verify:live`, and
`npm run test:live:fullstack`. Reports contain status metadata, never credentials.
