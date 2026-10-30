import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { QlooService } from "../services/qloo.js";
test(
  "live Qloo authentication, search and related-entity contract",
  { skip: !process.env.QLOO_API_KEY },
  async () => {
    const qloo = new QlooService();
    const entities = await qloo.searchEntities("Interstellar", "movie");
    assert.ok(entities.length, "No search matches returned");
    assert.ok(
      entities.some((e) => e.tags.length),
      "Search tags were not normalized",
    );
    assert.ok(
      entities.every((e) =>
        e.tags.every(
          (t) => typeof t.id === "string" && typeof t.name === "string",
        ),
      ),
      "Invalid normalized tags",
    );
    const related = await qloo.getRelatedEntities(
      [entities[0].entity_id],
      "book",
    );
    assert.ok(related.length, "No related books returned");
    const games = await qloo.getRelatedEntities(
      [entities[0].entity_id],
      "videogame",
    );
    assert.ok(games.length, "No related games returned");
    assert.ok(
      games.every((e) => e.subtype === "urn:entity:videogame"),
      "Gaming filter was not applied",
    );
  },
);
