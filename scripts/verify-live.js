import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  initializeApp,
  applicationDefault,
  deleteApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { inspectConfiguration, providerFailure } from "../server/readiness.js";
import { QlooService } from "../server/services/qloo.js";
import { LLMProvider } from "../server/services/llm.js";

const report = {
  checkedAt: new Date().toISOString(),
  configuration: inspectConfiguration(),
  checks: [],
};
async function check(name, run) {
  const start = Date.now();
  try {
    await run();
    report.checks.push({
      name,
      status: "passed",
      durationMs: Date.now() - start,
    });
  } catch (e) {
    report.checks.push({
      name,
      status: "failed",
      durationMs: Date.now() - start,
      ...providerFailure(e),
    });
  }
  console.info(JSON.stringify(report.checks.at(-1)));
}
if (report.configuration.ok) {
  const credential = applicationDefault();
  const app = initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID,
    }),
    db = getFirestore(app);
  db.settings({ preferRest: true });
  try {
    await check("Firebase Admin target-project access", async () => {
      // OAuth lookup of a random nonexistent UID verifies access without listing users.
      // Parse Google's structured reason directly: some Admin SDK errors lose it.
      const { access_token } = await credential.getAccessToken();
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(process.env.FIREBASE_PROJECT_ID)}/accounts:lookup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            ...(process.env.GOOGLE_CLOUD_QUOTA_PROJECT
              ? {
                  "x-goog-user-project": process.env.GOOGLE_CLOUD_QUOTA_PROJECT,
                }
              : {}),
          },
          body: JSON.stringify({ localId: [`readiness-${randomUUID()}`] }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        const body = await response.json();
        const reason =
          body.error?.details?.find(
            (detail) => typeof detail.reason === "string",
          )?.reason ||
          body.error?.status ||
          "AUTH_CHECK_FAILED";
        const safeReason = /^[A-Z_]+$/.test(reason)
          ? reason
          : "AUTH_CHECK_FAILED";
        throw Object.assign(new Error(safeReason), { code: safeReason });
      }
    });
    await check("Firestore target-project access", () =>
      db.doc("learningMigrations/001_taste_learning").get(),
    );
    await check("Qloo authenticated Search and Insights", async () => {
      const qloo = new QlooService(),
        entities = await qloo.searchEntities("Interstellar", "movie");
      if (!entities.length)
        throw Object.assign(new Error(), { code: "QLOO_EMPTY_SEARCH" });
      const related = await qloo.getRelatedEntities(
        [entities[0].entity_id],
        "book",
      );
      if (!related.length)
        throw Object.assign(new Error(), { code: "QLOO_EMPTY_INSIGHTS" });
    });
    await check("LLM structured function call", () =>
      new LLMProvider().callTool(
        "verify_readiness",
        "Set ok to true to confirm function calling works.",
        {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
        { task: "Check function calling" },
        z.object({ ok: z.literal(true) }),
      ),
    );
  } finally {
    await db.terminate();
    await deleteApp(app);
  }
} else
  console.error("Configuration validation failed; no live requests were made.");
report.ok =
  report.configuration.ok &&
  report.checks.length === 4 &&
  report.checks.every((c) => c.status === "passed");
// This report contains status metadata only, no entity payloads, account IDs, tokens or provider keys.
await writeFile(
  "docs/live-readiness.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.info(
  `Live readiness: ${report.ok ? "PASSED" : "FAILED"}. See docs/live-readiness.json.`,
);
process.exitCode = report.ok ? 0 : 1;
