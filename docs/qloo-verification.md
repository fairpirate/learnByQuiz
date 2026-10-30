# Qloo hackathon API verification

Verified on **October 31, 2026** against the [Qloo Agentic Hackathon Developer Guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide), its linked [Search reference](https://docs.qloo.com/reference/get-search), and [Insights reference](https://docs.qloo.com/reference/insights-api-deep-dive). The pages were retrieved directly when the search tool could not open them.

## Findings and changes

| Check | Finding / project behavior |
| --- | --- |
| Environment | Hackathon keys work only with `https://hackathon.api.qloo.com`. The service default and `.env.example` now use this host. A separate production key can still use an explicitly configured production host. |
| Authentication | The backend sends `X-Api-Key`, with no credential query parameter or Bearer authentication to Qloo. |
| Methods and endpoints | Search uses `GET /search`; recommendations use `GET /v2/insights`. Requests explicitly use GET and query parameters. Legacy `/recs`, `/recommendations`, and combined `/v2/insights/search` paths are not used. |
| Signals | Entity IDs returned by Search become `signal.interests.entities`; each Insights request includes `filter.type`. Seed exclusions use `filter.exclude.entities`. |
| Search tag shape | A live Search request initially failed our validator: Search uses `tag_id`, while the previous implementation expected `id`. Both Search `tag_id` and Insights `id` are now validated and normalized into the existing internal `{id, name}` format. No profile/database format change is required. |
| Gaming type discrepancy | The hackathon guide lists `urn:entity:video_game`, but its linked API schemas list `urn:entity:videogame`. Live Search and Insights requests accepted `videogame` (HTTP 200); requests with `video_game` returned HTTP 400. The project retains `videogame`, with regression coverage. |
| Destination Insights | A request with a Search-derived entity signal and `filter.type=urn:entity:destination` returned HTTP 200, although the linked Insights schema's enum omits this guide-listed category. |
| Error handling | Added specific sanitized errors for Qloo 401 authentication/environment failures, 403 access/type failures, and 400 invalid requests. Existing timeout, unavailable, invalid-response, empty-search, and rate-limit handling remains. |
| Caching and response data | The private, bounded server cache remains. No live entity payloads were saved into the repository. Tests use synthetic metadata. |
| Credentials | The credential found in `.env.example` was moved into the ignored, permission-restricted `.env`. The example now has a blank key. A scan of publishable project files found no copy of the configured key. |

## Reproducible verification

`npm run test:live` runs through the actual `QlooService` using backend environment configuration. The strengthened test checks:

1. Successful authenticated Search for a movie.
2. Nonempty results with normalized string tag IDs and names.
3. Nonempty related book recommendations using the resolved entity ID.
4. Nonempty gaming recommendations whose returned subtype matches `urn:entity:videogame`.

**Result: passed, with no skipped live test.** No provider response bodies or credentials are written by the test.

The backend regression suite passed **21 tests**, including new cases for Search tag normalization, explicit GET/header behavior, gaming type spelling, production-host override, malformed tag rejection, and provider status errors. The production frontend build passed. It retains the existing advisory warning for an entry chunk larger than 500 kB.

## Expanded production-verification pass

The later live matrix verified every category exposed by the app: movies, television, music artists, books, games, destinations, places, brands, people and podcasts, for both Search and Insights. It also verified caching, fuzzy search responses and invalid authentication. All 23 subcases passed (24 Node test results including the parent).

This broader run found two additional provider metadata forms: place tags can be null, and artist tags can contain a namespace-only `{type}` placeholder. The service now accepts those observed forms, normalizes null to an empty tag list, and excludes placeholders without fabricating tag IDs or labels. Synthetic regression fixtures cover both. Arbitrary malformed tags are still rejected.

Unmatched text can yield fuzzy matches from Qloo; an arbitrary invented query is not a reliable way to force an empty live result. The empty-array/404 branches remain covered by deterministic provider-mock tests.

## Remaining verification boundaries

This confirms live Qloo authentication, Search, tag normalization, and selected Insights recommendations through the application service. It does not verify every Qloo entity category or parameter. Firebase was subsequently verified independently; see [Firebase verification](firebase-verification.json). LLM availability and the complete credential-backed AI generation workflow remain unverified until API credit is available.
