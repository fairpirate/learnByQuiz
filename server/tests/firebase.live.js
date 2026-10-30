import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  initializeApp,
  applicationDefault,
  deleteApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createApp } from "../app.js";
import { FirestoreRepository } from "../repository.js";
import { QlooService } from "../services/qloo.js";
import { LLMProvider } from "../services/llm.js";
import { LearningAgent } from "../services/agent.js";
import { providerFailure } from "../readiness.js";
import { draft } from "./helpers.js";

test(
  "live Firebase: actual sign-in, repository writes, API isolation, transactions, rules and revocation",
  { timeout: 180000 },
  async (t) => {
    assert.ok(
      !process.env.FIRESTORE_EMULATOR_HOST,
      "A real Firebase project is required",
    );
    for (const key of [
      "FIREBASE_PROJECT_ID",
      "VITE_PROJECT_ID",
      "VITE_API_KEY",
    ])
      assert.ok(
        process.env[key],
        `${key} is required; live verification never skips`,
      );
    assert.equal(
      process.env.FIREBASE_PROJECT_ID,
      process.env.VITE_PROJECT_ID,
      "App project IDs must match",
    );
    const firebase = initializeApp(
        {
          credential: applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID,
        },
        `live-firebase-${randomUUID()}`,
      ),
      admin = getAuth(firebase),
      db = getFirestore(firebase);
    db.settings({ preferRest: true });
    const repo = new FirestoreRepository(db),
      qloo = new QlooService(),
      agent = new LearningAgent({ repo, qloo, llm: new LLMProvider() }),
      actors = [];
    const report = {
      checkedAt: new Date().toISOString(),
      project: process.env.FIREBASE_PROJECT_ID,
      checks: [],
      ok: false,
    };
    let server, origin;
    async function check(name, run) {
      await t.test(name, async () => {
        try {
          await run();
          report.checks.push({ name, status: "passed" });
        } catch (error) {
          report.checks.push({
            name,
            status: "failed",
            ...providerFailure(error),
          });
          throw error;
        }
      });
    }
    async function api(
      path,
      {
        actor = actors[0],
        method = "GET",
        body,
        anonymous = false,
        token,
      } = {},
    ) {
      const response = await fetch(`${origin}/api${path}`, {
        method,
        headers: {
          ...(!anonymous
            ? { Authorization: `Bearer ${token || actor.token}` }
            : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
      };
    }
    const expectStatus = (result, status) =>
      assert.equal(
        result.status,
        status,
        `Expected HTTP ${status}, received ${result.status} (${result.data?.error?.code || "no code"})`,
      );
    try {
      await db.doc("learningMigrations/001_taste_learning").get();
      for (let i = 0; i < 2; i++) {
        const password = `Q!${randomUUID()}x7`,
          email = `learnbyquiz-live-${randomUUID()}@example.invalid`;
        const user = await admin.createUser({ email, password });
        actors.push({ uid: user.uid, email, password });
      }
      await check(
        "Email/Password sign-in and real ID-token verification",
        async () => {
          for (const actor of actors) {
            const response = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.VITE_API_KEY)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: actor.email,
                  password: actor.password,
                  returnSecureToken: true,
                }),
                signal: AbortSignal.timeout(15000),
              },
            );
            assert.equal(
              response.status,
              200,
              "Firebase Email/Password sign-in failed; check the enabled provider and browser API key",
            );
            const data = await response.json();
            actor.token = data.idToken;
            assert.equal(data.localId, actor.uid);
            assert.equal(
              (await admin.verifyIdToken(actor.token, true)).uid,
              actor.uid,
            );
          }
        },
      );
      assert.ok(
        actors.every((a) => a.token),
        "Sign-in must succeed before API tests",
      );
      server = createApp({
        repo,
        qloo,
        agent,
        verifyToken: (token) => admin.verifyIdToken(token, true),
        logger: () => {},
      }).listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      origin = `http://127.0.0.1:${server.address().port}`;
      await check(
        "Unauthenticated and invalid-token API access denied",
        async () => {
          expectStatus(await api("/taste/profile", { anonymous: true }), 401);
          expectStatus(
            await api("/taste/profile", { token: "invalid-live-test-token" }),
            401,
          );
        },
      );
      await check(
        "Real Qloo-backed profile create, read, edit and owner isolation",
        async () => {
          const found = await api("/taste/discover", {
            method: "POST",
            body: { query: "Interstellar", type: "movie" },
          });
          expectStatus(found, 200);
          assert.ok(found.data.entities.length);
          const selected = found.data.entities[0],
            body = {
              interests: ["Science fiction"],
              subjects: ["Astronomy"],
              entities: [
                {
                  entity_id: selected.entity_id,
                  name: selected.name,
                  subtype: selected.subtype,
                },
              ],
            };
          expectStatus(
            await api("/taste/profile", { method: "PUT", body }),
            200,
          );
          const own = await api("/taste/profile");
          expectStatus(own, 200);
          assert.equal(
            own.data.profile.entities[0].entity_id,
            selected.entity_id,
          );
          const other = await api("/taste/profile", { actor: actors[1] });
          expectStatus(other, 200);
          assert.equal(other.data.profile, null);
          expectStatus(
            await api("/taste/profile", {
              method: "PUT",
              body: { ...body, interests: ["Science fiction", "Technology"] },
            }),
            200,
          );
          assert.equal(
            (await api("/taste/profile")).data.profile.interests.length,
            2,
          );
        },
      );
      await check(
        "Deployed Firestore rules deny anonymous and authenticated direct reads/writes",
        async () => {
          const base = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/learningUsers/${actors[0].uid}/profiles`;
          for (const headers of [
            {},
            { Authorization: `Bearer ${actors[0].token}` },
          ]) {
            const read = await fetch(`${base}/taste`, {
              headers,
              signal: AbortSignal.timeout(10000),
            });
            assert.equal(
              read.status,
              403,
              "Deployed rules expose private profile reads",
            );
            const write = await fetch(`${base}/unauthorized-test`, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                fields: { probe: { booleanValue: true } },
              }),
              signal: AbortSignal.timeout(10000),
            });
            assert.equal(
              write.status,
              403,
              "Deployed rules permit direct browser writes",
            );
          }
        },
      );
      await check(
        "Saved quiz start, server-side grading and concurrent idempotent Firestore transaction",
        async () => {
          const quizId = randomUUID();
          // Synthetic content is limited to this test's isolated user and removed in finally.
          await repo.put(actors[0].uid, "quizzes", quizId, {
            id: quizId,
            title: "Firebase verification fixture",
            subject: "Astronomy",
            difficulty: "medium",
            questions: draft.questions,
            createdAt: new Date().toISOString(),
            startedAt: null,
          });
          expectStatus(
            await api(`/learning/quizzes/${quizId}/start`, {
              actor: actors[1],
              method: "POST",
            }),
            404,
          );
          expectStatus(
            await api("/agents/analyze-performance", {
              method: "POST",
              body: { quizId, answers: [0, 0, 0, 0, 0] },
            }),
            409,
          );
          const started = await api(`/learning/quizzes/${quizId}/start`, {
            method: "POST",
          });
          expectStatus(started, 200);
          assert.ok(
            started.data.quiz.questions.every((q) => !("correctIndex" in q)),
          );
          const submit = (answers) =>
            api("/agents/analyze-performance", {
              method: "POST",
              body: { quizId, answers },
            });
          const [first, duplicate] = await Promise.all([
            submit([0, 0, 0, 0, 0]),
            submit([0, 0, 0, 0, 0]),
          ]);
          expectStatus(first, 200);
          expectStatus(duplicate, 200);
          assert.equal(first.data.performance.accuracy, 100);
          assert.equal(duplicate.data.performance.accuracy, 100);
          assert.equal(first.data.analytics.attempts, 1);
          const changed = await submit([1, 1, 1, 1, 1]);
          expectStatus(changed, 200);
          assert.equal(changed.data.performance.accuracy, 100);
          assert.equal(changed.data.analytics.attempts, 1);
          const dashboard = await api("/learning/dashboard");
          expectStatus(dashboard, 200);
          assert.equal(dashboard.data.quizzes.length, 1);
          assert.equal(dashboard.data.analytics.attempts, 1);
          assert.equal(dashboard.data.analytics.nextDifficulty, "hard");
          expectStatus(await api("/taste/profile", { method: "DELETE" }), 204);
          assert.equal((await api("/taste/profile")).data.profile, null);
          assert.equal(
            (await api("/learning/dashboard")).data.quizzes.length,
            1,
          );
        },
      );
      await check(
        "Actual Firebase refresh-token revocation is enforced",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1100));
          await admin.revokeRefreshTokens(actors[1].uid);
          expectStatus(await api("/taste/profile", { actor: actors[1] }), 401);
        },
      );
    } catch (error) {
      report.checks.push({
        name: "Live Firebase prerequisite",
        status: "failed",
        ...providerFailure(error),
      });
      throw new Error(
        "Live Firebase verification could not complete; see docs/firebase-verification.json for sanitized results",
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      const cleanup = await Promise.allSettled(
        actors.map(async (actor) => {
          await db.recursiveDelete(repo.user(actor.uid));
          await admin.deleteUser(actor.uid);
        }),
      );
      const clean = cleanup.every((r) => r.status === "fulfilled");
      report.checks.push({
        name: "Temporary test account and record cleanup",
        status: clean ? "passed" : "failed",
      });
      await db.terminate();
      await deleteApp(firebase);
      report.ok = report.checks.every((c) => c.status === "passed");
      await writeFile(
        "docs/firebase-verification.json",
        JSON.stringify(report, null, 2) + "\n",
      );
      assert.ok(
        clean,
        "Temporary test cleanup failed; do not treat this run as production-ready",
      );
    }
  },
);
