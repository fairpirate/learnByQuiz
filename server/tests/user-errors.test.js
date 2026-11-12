import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { userErrorMessage, UserFacingError } from "../../shared/user-errors.js";
import { createApp } from "../app.js";
import { AppError } from "../errors.js";
import { LearningAgent } from "../services/agent.js";
import { MemoryRepository, profile } from "./helpers.js";

test("unknown and provider errors never expose raw messages, including malformed codes", () => {
  for (const code of [
    undefined,
    "UNRECOGNIZED",
    "toString",
    "__proto__",
    { toString: null },
  ]) {
    const message = userErrorMessage({
      code,
      message:
        "Firebase: Error auth/secret NVIDIA_API_KEY stack at private.js:3",
    });
    assert.match(message, /try again/i);
    assert.doesNotMatch(message, /Firebase|NVIDIA|auth\/|private\.js/);
  }
  assert.match(
    userErrorMessage({ code: "auth/invalid-credential" }),
    /Check your email address and password/,
  );
  assert.equal(
    userErrorMessage({ code: "auth/wrong-password" }),
    userErrorMessage({ code: "auth/user-not-found" }),
  );
  assert.match(userErrorMessage({ status: 503 }), /temporarily unavailable/);
  assert.match(
    userErrorMessage({ code: "LLM_BILLING_REQUIRED" }),
    /Buying more learning credits won't fix this/,
  );
  const network = new UserFacingError("NETWORK_ERROR");
  assert.equal(userErrorMessage(network), network.message);
});

test("API errors retain support identifiers while returning understandable messages", async () => {
  for (const [code, expected] of [
    ["LLM_NOT_CONFIGURED", /AI learning isn't available yet/],
    ["LLM_AUTH_FAILED", /AI learning is temporarily unavailable/],
    ["LLM_BILLING_REQUIRED", /Buying more learning credits won't fix this/],
    [
      "PAYPAL_REQUEST_FAILED",
      /Check payment.*before starting another checkout/,
    ],
    ["UNKNOWN_PROVIDER_ERROR", /temporarily unavailable/],
  ]) {
    const logs = [];
    const api = createApp({
      repo: new MemoryRepository(),
      agent: {
        run: async () => {
          throw new AppError(
            503,
            code,
            "Configure NVIDIA_API_KEY. Firebase permission denied at private.js",
          );
        },
      },
      verifyToken: async () => ({ uid: "learner" }),
      logger: (line) => logs.push(JSON.parse(line)),
    });
    const response = await request(api)
      .post("/api/agents/generate-quiz")
      .auth("test-token", { type: "bearer" })
      .send({})
      .expect(503);
    assert.equal(response.body.error.code, code);
    assert.ok(response.body.error.requestId);
    assert.match(response.body.error.message, expected);
    assert.doesNotMatch(
      response.text,
      /NVIDIA|Firebase|private\.js|permission denied/,
    );
    assert.ok(
      logs.some(
        (log) =>
          log.level === "error" &&
          log.code === code &&
          log.requestId === response.body.error.requestId,
      ),
    );
  }
});

test("saved AI execution errors use friendly text and keep diagnostic codes separately", async () => {
  const repo = new MemoryRepository();
  await repo.put("learner", "profiles", "taste", profile);
  const agent = new LearningAgent({
    repo,
    llm: {
      callTool: async () => {
        throw new AppError(
          503,
          "LLM_NOT_CONFIGURED",
          "Configure NVIDIA_API_KEY on the server.",
        );
      },
    },
  });
  await assert.rejects(
    agent.run("learner", {
      difficulty: "medium",
      format: "multiple",
      targetType: "book",
    }),
    { code: "LLM_NOT_CONFIGURED" },
  );
  const execution = (await repo.list("learner", "executions"))[0];
  assert.equal(execution.errorCode, "LLM_NOT_CONFIGURED");
  assert.match(execution.error, /AI learning isn't available yet/);
  assert.equal(execution.steps.at(-1).errorCode, "LLM_NOT_CONFIGURED");
  assert.doesNotMatch(JSON.stringify(execution), /NVIDIA_API_KEY|Configure/);
});
