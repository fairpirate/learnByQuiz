import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { QlooService } from "../services/qloo.js";

// Synthetic/public search terms only; never persist or print returned entity data.
const searches = [
  ["movie", "Interstellar"],
  ["tv_show", "Breaking Bad"],
  ["artist", "Daft Punk"],
  ["book", "Dune"],
  ["videogame", "The Legend of Zelda"],
  ["destination", "Paris"],
  ["place", "Louvre"],
  ["brand", "Nike"],
  ["person", "Tom Hanks"],
  ["podcast", "Radiolab"],
];

test(
  "live Qloo matrix: every application category, caching, empty search and invalid authentication",
  { timeout: 180000 },
  async (t) => {
    assert.ok(
      process.env.QLOO_API_KEY,
      "QLOO_API_KEY is required; this release test never skips",
    );
    let networkCalls = 0;
    const qloo = new QlooService({
      fetchImpl: async (...args) => {
        networkCalls++;
        return fetch(...args);
      },
    });
    let seed;
    for (const [type, query] of searches)
      await t.test(`search ${type}`, async () => {
        const results = await qloo.searchEntities(query, type);
        assert.ok(
          results.length,
          `No matches for the ${type} verification query`,
        );
        assert.ok(
          results.every((e) => e.subtype === `urn:entity:${type}`),
          `Search type mismatch for ${type}`,
        );
        if (type === "movie") seed = results[0].entity_id;
      });
    assert.ok(
      seed,
      "A real Search entity is required for Insights verification",
    );
    for (const [type] of searches)
      await t.test(`Insights ${type}`, async () => {
        const results = await qloo.getRelatedEntities([seed], type);
        assert.ok(results.length, `No Insights returned for ${type}`);
        assert.ok(
          results.every((e) => e.subtype === `urn:entity:${type}`),
          `Insights type mismatch for ${type}`,
        );
        assert.ok(
          results.every((e) => e.entity_id !== seed),
          "Seed exclusions were not applied",
        );
      });
    await t.test("repeat requests use private server cache", async () => {
      const before = networkCalls;
      await qloo.searchEntities(searches[0][1], searches[0][0]);
      await qloo.getRelatedEntities([seed], "book");
      assert.equal(networkCalls, before);
    });
    await t.test(
      "unmatched search remains valid even when Qloo returns fuzzy matches",
      async () => {
        const results = await qloo.searchEntities(
          "learnbyquiz-verification-no-such-entity-64d7d91bd914e",
          "movie",
        );
        assert.ok(Array.isArray(results));
      },
    );
    await t.test(
      "invalid API key produces an authentication error",
      async () => {
        const denied = new QlooService({
          apiKey: "invalid-learnbyquiz-verification-key",
        });
        await assert.rejects(denied.searchEntities("Interstellar", "movie"), {
          code: "QLOO_AUTH_FAILED",
        });
      },
    );
  },
);
