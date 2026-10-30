import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { LearningAgent } from "../services/agent.js";
import {
  MemoryRepository,
  profile,
  entity,
  draft,
  fakeLLM,
} from "./helpers.js";
const quizId = "8b9617a4-1517-4b30-915f-4ab014b28bf9";
function setup() {
  const repo = new MemoryRepository(),
    qloo = {
      searchEntities: async () => [entity],
      getPersonalizedRecommendations: async () => [entity],
    };
  const agent = new LearningAgent({ repo, qloo, llm: fakeLLM() });
  return {
    repo,
    api: request(
      createApp({
        repo,
        qloo,
        agent,
        verifyToken: async (token) => {
          if (!["alice", "bob"].includes(token)) throw new Error();
          return { uid: token };
        },
        logger: () => {},
      }),
    ),
  };
}
test("authentication required and profile records isolated by verified UID", async () => {
  const { api } = setup();
  await api.get("/api/taste/profile").expect(401);
  await api
    .get("/api/taste/profile")
    .auth("bad", { type: "bearer" })
    .expect(401);
  await api
    .put("/api/taste/profile")
    .auth("alice", { type: "bearer" })
    .send(profile)
    .expect(200);
  const bob = await api
    .get("/api/taste/profile")
    .auth("bob", { type: "bearer" })
    .expect(200);
  assert.equal(bob.body.profile, null);
  await api
    .put("/api/taste/profile")
    .auth("bob", { type: "bearer" })
    .send({ ...profile, uid: "alice" })
    .expect(400);
  await api
    .delete("/api/taste/profile")
    .auth("alice", { type: "bearer" })
    .expect(204);
  assert.equal(
    (await api.get("/api/taste/profile").auth("alice", { type: "bearer" })).body
      .profile,
    null,
  );
});
test("entity discovery validates input; generation, grading, analytics and retry form a full API flow", async () => {
  const { api } = setup();
  await api
    .post("/api/taste/discover")
    .auth("alice", { type: "bearer" })
    .send({ query: "Interstellar", type: "movie" })
    .expect(200);
  await api
    .post("/api/taste/discover")
    .auth("alice", { type: "bearer" })
    .send({ query: "", type: "fake" })
    .expect(400);
  await api
    .put("/api/taste/profile")
    .auth("alice", { type: "bearer" })
    .send(profile)
    .expect(200);
  const generated = await api
    .post("/api/agents/generate-quiz")
    .auth("alice", { type: "bearer" })
    .send({ difficulty: "medium", format: "multiple", targetType: "book" })
    .expect(200);
  const id = generated.body.quiz.id;
  assert.equal(generated.body.quiz.questions[0].correctIndex, undefined);
  await api
    .post(`/api/learning/quizzes/${id}/start`)
    .auth("bob", { type: "bearer" })
    .expect(404);
  await api
    .post("/api/agents/analyze-performance")
    .auth("alice", { type: "bearer" })
    .send({ quizId: id, answers: [0, 0, 0, 0, 0] })
    .expect(409);
  await api
    .post(`/api/learning/quizzes/${id}/start`)
    .auth("alice", { type: "bearer" })
    .expect(200);
  const result = await api
    .post("/api/agents/analyze-performance")
    .auth("alice", { type: "bearer" })
    .send({ quizId: id, answers: [0, 0, 0, 0, 0] })
    .expect(200);
  assert.equal(result.body.performance.accuracy, 100);
  assert.equal(result.body.analytics.nextDifficulty, "hard");
  const retry = await api
    .post("/api/agents/analyze-performance")
    .auth("alice", { type: "bearer" })
    .send({ quizId: id, answers: [1, 1, 1, 1, 1] })
    .expect(200);
  assert.equal(retry.body.performance.accuracy, 100);
  assert.equal(retry.body.analytics.attempts, 1);
  const dashboard = await api
    .get("/api/learning/dashboard")
    .auth("alice", { type: "bearer" })
    .expect(200);
  assert.equal(dashboard.body.quizzes[0].completed, true);
  assert.equal(dashboard.body.analytics.accuracy, 100);
});
test("unknown quiz and malformed answers cannot write performance", async () => {
  const { api, repo } = setup();
  await repo.put("alice", "quizzes", quizId, {
    id: quizId,
    questions: draft.questions,
    createdAt: new Date().toISOString(),
  });
  await api
    .post("/api/agents/analyze-performance")
    .auth("bob", { type: "bearer" })
    .send({ quizId, answers: [0, 0, 0, 0, 0] })
    .expect(404);
  await api
    .post("/api/agents/analyze-performance")
    .auth("alice", { type: "bearer" })
    .send({ quizId, answers: [9] })
    .expect(400);
  assert.equal((await repo.list("alice", "performances")).length, 0);
});
test("canonical Qloo metadata replaces user supplied tags and invented references are rejected", async () => {
  const { api } = setup();
  const input = {
    ...profile,
    entities: [{ ...entity, tags: [{ id: "untrusted", name: "Invented" }] }],
  };
  const saved = await api
    .put("/api/taste/profile")
    .auth("alice", { type: "bearer" })
    .send(input)
    .expect(200);
  assert.deepEqual(saved.body.profile.entities[0].tags, []);
  await api
    .put("/api/taste/profile")
    .auth("alice", { type: "bearer" })
    .send({ ...profile, entities: [{ ...entity, entity_id: quizId }] })
    .expect(400);
});
test("generation rate limit applies per authenticated user", async () => {
  const { api } = setup();
  for (let i = 0; i < 10; i++)
    await api
      .post("/api/agents/generate-quiz")
      .auth("alice", { type: "bearer" })
      .send({})
      .expect(409);
  await api
    .post("/api/agents/generate-quiz")
    .auth("alice", { type: "bearer" })
    .send({})
    .expect(429);
  await api
    .post("/api/agents/generate-quiz")
    .auth("bob", { type: "bearer" })
    .send({})
    .expect(409);
});
test("malformed and oversized requests return safe structured errors", async () => {
  const { api } = setup();
  const malformed = await api
    .post("/api/taste/profile")
    .auth("alice", { type: "bearer" })
    .set("Content-Type", "application/json")
    .send('{"private":"do not echo"')
    .expect(400);
  assert.equal(malformed.body.error.code, "MALFORMED_JSON");
  assert.ok(!malformed.text.includes("do not echo"));
  const oversized = await api
    .post("/api/taste/discover")
    .auth("alice", { type: "bearer" })
    .send({ query: "x".repeat(40000) })
    .expect(413);
  assert.equal(oversized.body.error.code, "PAYLOAD_TOO_LARGE");
});
test("Firebase service outages and database permission failures are not mislabeled as invalid sessions", async () => {
  const base = {
    repo: new MemoryRepository(),
    qloo: {},
    agent: {},
    logger: () => {},
  };
  const unavailable = request(
    createApp({
      ...base,
      verifyToken: async () => {
        throw Object.assign(new Error("private provider details"), {
          code: "auth/insufficient-permission",
        });
      },
    }),
  );
  const denied = await unavailable
    .get("/api/taste/profile")
    .auth("signed-token", { type: "bearer" })
    .expect(503);
  assert.equal(denied.body.error.code, "AUTH_SERVICE_UNAVAILABLE");
  assert.ok(!denied.text.includes("private provider details"));
  const repo = new MemoryRepository();
  repo.get = async () => {
    throw Object.assign(new Error("private database details"), { code: 7 });
  };
  const storage = request(
    createApp({ ...base, repo, verifyToken: async () => ({ uid: "alice" }) }),
  );
  const failed = await storage
    .get("/api/taste/profile")
    .auth("signed-token", { type: "bearer" })
    .expect(503);
  assert.equal(failed.body.error.code, "LEARNING_STORAGE_UNAVAILABLE");
  assert.ok(!failed.text.includes("private database details"));
});
