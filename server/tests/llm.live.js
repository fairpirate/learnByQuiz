import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { LLMProvider } from "../services/llm.js";
import { providerFailure } from "../readiness.js";

test("live configured LLM returns a validated named function call", async () => {
  try {
    const result = await new LLMProvider().callTool(
      "verify_readiness",
      "Return ok=true and the integer sum of the supplied operands.",
      {
        type: "object",
        properties: { ok: { type: "boolean" }, sum: { type: "integer" } },
        required: ["ok", "sum"],
        additionalProperties: false,
      },
      { operands: [17, 25] },
      z.object({ ok: z.literal(true), sum: z.literal(42) }).strict(),
    );
    assert.deepEqual(result, { ok: true, sum: 42 });
  } catch (error) {
    const safe = providerFailure(error);
    throw new Error(`${safe.code}: ${safe.message}`);
  }
});
