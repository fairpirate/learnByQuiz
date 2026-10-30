import test from "node:test";
import assert from "node:assert/strict";
import { QlooService } from "../services/qloo.js";
import { entity } from "./helpers.js";
const response = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("search sends server key and documented parameters; validates and caches results", async () => {
  let calls = 0;
  const q = new QlooService({
    apiKey: "secret",
    fetchImpl: async (url, opts) => {
      calls++;
      assert.equal(url.origin, "https://hackathon.api.qloo.com");
      assert.equal(url.pathname, "/search");
      assert.equal(opts.method, "GET");
      assert.equal(url.searchParams.has("api_key"), false);
      assert.equal(opts.headers.Authorization, undefined);
      assert.equal(url.searchParams.get("query"), "Interstellar");
      assert.equal(url.searchParams.get("types"), "urn:entity:movie");
      assert.equal(opts.headers["X-Api-Key"], "secret");
      return response({
        results: [
          {
            ...entity,
            subtype: undefined,
            types: ["urn:entity", "urn:entity:movie"],
            tags: [{ tag_id: "urn:tag:genre:media:fiction", name: "Fiction" }],
          },
        ],
      });
    },
  });
  assert.equal(
    (await q.searchEntities("Interstellar", "movie"))[0].entity_id,
    entity.entity_id,
  );
  const cached = await q.searchEntities("Interstellar", "movie");
  assert.deepEqual(cached[0].tags, [
    { id: "urn:tag:genre:media:fiction", name: "Fiction" },
  ]);
  assert.equal(cached[0].subtype, "urn:entity:movie");
  assert.equal(calls, 1);
});
test("related entities use Insights, supplied signals and actual affinity", async () => {
  const q = new QlooService({
    apiKey: "secret",
    fetchImpl: async (url) => {
      assert.equal(url.pathname, "/v2/insights");
      assert.equal(url.searchParams.get("filter.type"), "urn:entity:book");
      assert.equal(
        url.searchParams.get("signal.interests.entities"),
        entity.entity_id,
      );
      return response({
        success: true,
        results: {
          entities: [
            {
              ...entity,
              tags: [{ id: "urn:tag:genre:media:fiction", name: "Fiction" }],
              query: { affinity: 0.75 },
            },
          ],
        },
      });
    },
  });
  assert.equal(
    (await q.getRelatedEntities([entity.entity_id], "book"))[0].affinity,
    0.75,
  );
});
test("missing configuration, malformed responses, timeouts, upstream errors and rate limits fail explicitly", async () => {
  await assert.rejects(new QlooService({ apiKey: "" }).searchEntities("x"), {
    code: "QLOO_NOT_CONFIGURED",
  });
  for (const [fetchImpl, code] of [
    [async () => response({ results: [{}] }), "QLOO_INVALID_RESPONSE"],
    [async () => response({}, 429), "QLOO_RATE_LIMIT"],
    [async () => response({}, 401), "QLOO_AUTH_FAILED"],
    [async () => response({}, 403), "QLOO_FORBIDDEN"],
    [async () => response({}, 400), "QLOO_INVALID_REQUEST"],
    [async () => response({}, 500), "QLOO_ERROR"],
    [
      async () => {
        throw new Error("timeout");
      },
      "QLOO_UNAVAILABLE",
    ],
  ])
    await assert.rejects(
      new QlooService({ apiKey: "key", fetchImpl }).searchEntities("x"),
      { code },
    );
});
test("no results is an empty result and errors are not cached", async () => {
  let count = 0;
  const q = new QlooService({
    apiKey: "key",
    fetchImpl: async () => {
      count++;
      return response({}, 404);
    },
  });
  assert.deepEqual(await q.searchEntities("x"), []);
  await q.searchEntities("x");
  assert.equal(count, 2);
});

test("gaming requests use the spelling accepted by the live Search and Insights APIs", async () => {
  const q = new QlooService({
    apiKey: "key",
    fetchImpl: async (url, opts) => {
      assert.equal(opts.method, "GET");
      const field = url.pathname === "/search" ? "types" : "filter.type";
      assert.equal(url.searchParams.get(field), "urn:entity:videogame");
      if (field === "filter.type") {
        assert.equal(
          url.searchParams.get("signal.interests.entities"),
          entity.entity_id,
        );
        assert.equal(
          url.searchParams.get("filter.exclude.entities"),
          entity.entity_id,
        );
      }
      return response(
        url.pathname === "/search"
          ? { results: [] }
          : { success: true, results: { entities: [] } },
      );
    },
  });
  await q.searchEntities("A game", "videogame");
  await q.discoverTaste([entity.entity_id], "videogame");
});
test("server configuration can explicitly select the production environment", async () => {
  const q = new QlooService({
    apiKey: "production-key",
    baseUrl: "https://api.qloo.com",
    fetchImpl: async (url) => {
      assert.equal(url.origin, "https://api.qloo.com");
      return response({ results: [] });
    },
  });
  await q.searchEntities("A book", "book");
});
test("unrecognized search tag shapes are rejected instead of losing cultural references", async () => {
  const q = new QlooService({
    apiKey: "key",
    fetchImpl: async () =>
      response({ results: [{ ...entity, tags: [{ name: "No identifier" }] }] }),
  });
  await assert.rejects(q.searchEntities("A movie", "movie"), {
    code: "QLOO_INVALID_RESPONSE",
  });
});
test("verified artist namespace placeholders and null place tags normalize without invented metadata", async () => {
  const q = new QlooService({
    apiKey: "key",
    fetchImpl: async () =>
      response({
        success: true,
        results: {
          entities: [
            { ...entity, tags: null },
            {
              ...entity,
              tags: [
                { type: "urn:tag:genre:artist" },
                {
                  id: "urn:tag:genre:artist:synthetic",
                  name: "Synthetic genre",
                },
              ],
            },
          ],
        },
      }),
  });
  const results = await q.getRelatedEntities([entity.entity_id], "artist");
  assert.deepEqual(results[0].tags, []);
  assert.deepEqual(results[1].tags, [
    { id: "urn:tag:genre:artist:synthetic", name: "Synthetic genre" },
  ]);
});
