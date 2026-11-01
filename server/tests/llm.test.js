import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { LLMProvider } from "../services/llm.js";
import { resolveLLMConfiguration } from "../services/llm-config.js";
test("NVIDIA decodes JSON-encoded nested containers while preserving validation", async () => {
  let encoded = JSON.stringify([
    { options: JSON.stringify(["True", "False"]) },
  ]);
  const llm = new LLMProvider({
    provider: "nvidia",
    apiKey: "test",
    fetchImpl: async () =>
      Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              tool_calls: [
                {
                  function: {
                    name: "quiz",
                    arguments: JSON.stringify({ questions: encoded }),
                  },
                },
              ],
            },
          },
        ],
      }),
  });
  const schema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: { options: { type: "array", items: { type: "string" } } },
        },
      },
    },
  };
  const validator = z.object({
    questions: z
      .array(
        z.object({ options: z.tuple([z.literal("True"), z.literal("False")]) }),
      )
      .length(1),
  });
  assert.deepEqual(await llm.callTool("quiz", "", schema, {}, validator), {
    questions: [{ options: ["True", "False"] }],
  });
  encoded = JSON.stringify([{ options: [true, false] }]);
  await assert.rejects(llm.callTool("quiz", "", schema, {}, validator), {
    code: "LLM_INVALID_OUTPUT",
  });
});
test("schema repair is bounded and never retries provider rate limits", async () => {
  let calls = 0;
  const llm = new LLMProvider({
    provider: "nvidia",
    apiKey: "test",
    fetchImpl: async () => {
      calls++;
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              tool_calls: [
                {
                  function: {
                    name: "plan",
                    arguments: calls === 1 ? '{"ok":"wrong"}' : '{"ok":true}',
                  },
                },
              ],
            },
          },
        ],
      });
    },
  });
  assert.deepEqual(
    await llm.callTool("plan", "", {}, {}, z.object({ ok: z.literal(true) })),
    { ok: true },
  );
  assert.equal(calls, 2);
  calls = 0;
  llm.fetch = async () => {
    calls++;
    return Response.json(
      { error: { code: "rate_limit_exceeded" } },
      { status: 429 },
    );
  };
  await assert.rejects(llm.callTool("plan", "", {}, {}, z.object({})), {
    code: "LLM_RATE_LIMIT",
  });
  assert.equal(calls, 1);
  calls = 0;
  llm.fetch = async () => {
    calls++;
    return Response.json({});
  };
  await assert.rejects(llm.callTool("plan", "", {}, {}, z.object({})), {
    code: "LLM_INVALID_OUTPUT",
  });
  assert.equal(calls, 2);
});
test("NVIDIA configuration isolates keys and endpoint from existing provider settings", () => {
  const config = resolveLLMConfiguration({
    LLM_PROVIDER: "nvidia",
    LLM_API_KEY: "other-provider-key",
    LLM_BASE_URL: "https://other.example/v1",
    LLM_MODEL: "other-model",
  });
  assert.equal(config.apiKey, undefined);
  assert.equal(config.baseUrl, "https://integrate.api.nvidia.com/v1");
  assert.equal(config.model, "nvidia/nemotron-3.5-super-vl-120b-a12b");
  assert.throws(() => resolveLLMConfiguration({ LLM_PROVIDER: "typo" }));
  assert.throws(
    () =>
      new LLMProvider({
        provider: "nvidia",
        baseUrl: "https://other.example/v1",
      }),
  );
});
test("NVIDIA sends its documented non-streaming named-tool contract and validates output", async () => {
  const llm = new LLMProvider({
    provider: "nvidia",
    apiKey: "nvidia-test-key",
    fetchImpl: async (url, opts) => {
      assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
      assert.equal(opts.headers.Authorization, "Bearer nvidia-test-key");
      const body = JSON.parse(opts.body);
      assert.equal(body.max_tokens, 6000);
      assert.equal(body.max_completion_tokens, undefined);
      assert.equal(body.reasoning_effort, "none");
      assert.equal(body.stream, false);
      assert.equal(body.parallel_tool_calls, false);
      assert.equal(body.tool_choice.function.name, "plan");
      return Response.json({
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
      });
    },
  });
  assert.deepEqual(
    await llm.callTool("plan", "", {}, {}, z.object({ ok: z.literal(true) })),
    { ok: true },
  );
});
test("NVIDIA rejects truncated, multiple, wrong-name and invalid-schema tool responses", async () => {
  const valid = { function: { name: "plan", arguments: '{"ok":true}' } };
  for (const [finish_reason, tool_calls] of [
    ["length", [valid]],
    ["tool_calls", [valid, valid]],
    ["tool_calls", [{ function: { name: "other", arguments: "{}" } }]],
    ["tool_calls", [{ function: { name: "plan", arguments: '{"ok":false}' } }]],
  ]) {
    const llm = new LLMProvider({
      provider: "nvidia",
      apiKey: "key",
      fetchImpl: async () =>
        Response.json({
          choices: [{ finish_reason, message: { tool_calls } }],
        }),
    });
    await assert.rejects(
      llm.callTool("plan", "", {}, {}, z.object({ ok: z.literal(true) })),
      { code: "LLM_INVALID_OUTPUT" },
    );
  }
});
test("provider uses forced function calls and validates tool name and arguments", async () => {
  const llm = new LLMProvider({
    apiKey: "key",
    model: "configured-model",
    fetchImpl: async (url, opts) => {
      const b = JSON.parse(opts.body);
      assert.equal(b.max_completion_tokens, 6000);
      assert.equal(b.max_tokens, undefined);
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
    [410, "model_retired", "LLM_MODEL_UNAVAILABLE"],
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
