import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { LLMProvider } from "../services/llm.js";
test("provider uses forced function calls and validates tool name and arguments", async () => {
  const llm = new LLMProvider({
    apiKey: "key",
    model: "configured-model",
    fetchImpl: async (url, opts) => {
      const b = JSON.parse(opts.body);
      assert.equal(b.tool_choice.function.name, "plan");
      assert.equal(opts.headers.Authorization, "Bearer key");
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                tool_calls: [
                  { function: { name: "plan", arguments: '{"ok":true}' } },
                ],
              },
            },
          ],
        }),
      );
    },
  });
  assert.deepEqual(
    await llm.callTool(
      "plan",
      "plan",
      { type: "object" },
      {},
      z.object({ ok: z.boolean() }),
    ),
    { ok: true },
  );
});
test("provider rejects invalid output and missing credentials", async () => {
  const llm = new LLMProvider({
    apiKey: "key",
    model: "model",
    fetchImpl: async () => new Response("{}"),
  });
  await assert.rejects(llm.callTool("plan", "", {}, {}, z.object({})), {
    code: "LLM_INVALID_OUTPUT",
  });
  await assert.rejects(
    new LLMProvider({ apiKey: "" }).callTool("plan", "", {}, {}, z.object({})),
    { code: "LLM_NOT_CONFIGURED" },
  );
});
test("billing exhaustion, credentials, model access and temporary throttling have distinct safe errors", async () => {
  for (const [status, providerCode, code] of [
    [429, "credit_balance_exhausted", "LLM_BILLING_REQUIRED"],
    [429, "insufficient_quota", "LLM_BILLING_REQUIRED"],
    [429, "rate_limit_exceeded", "LLM_RATE_LIMIT"],
    [401, "invalid_api_key", "LLM_AUTH_FAILED"],
    [403, "permission_denied", "LLM_AUTH_FAILED"],
    [404, "model_not_found", "LLM_MODEL_UNAVAILABLE"],
    [500, "internal_error", "LLM_ERROR"],
  ]) {
    const llm = new LLMProvider({
      apiKey: "key",
      model: "model",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: { code: providerCode, message: "private upstream content" },
          }),
          { status },
        ),
    });
    await assert.rejects(
      llm.callTool("plan", "", {}, {}, z.object({})),
      (error) =>
        error.code === code &&
        !error.message.includes("private upstream content"),
    );
  }
});
