import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initializeApp,
  applicationDefault,
  deleteApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { resolve } from "node:path";
import { createApp } from "../app.js";
import { FirestoreRepository } from "../repository.js";
import { QlooService } from "../services/qloo.js";
import { LLMProvider } from "../services/llm.js";
import { LearningAgent } from "../services/agent.js";
import { inspectConfiguration } from "../readiness.js";

test(
  "live production API: actual Firebase sign-in, persistence, all quiz formats/difficulties, grading and ownership",
  { timeout: 1200000 },
  async (t) => {
    assert.equal(
      inspectConfiguration().ok,
      true,
      "Complete production configuration is required; release tests never skip",
    );
    assert.ok(
      !process.env.FIRESTORE_EMULATOR_HOST,
      "This suite must use the configured real Firebase project",
    );
    const firebase = initializeApp(
        {
          credential: applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID,
        },
        `live-${randomUUID()}`,
      ),
      admin = getAuth(firebase),
      db = getFirestore(firebase);
    db.settings({ preferRest: true });
    const repo = new FirestoreRepository(db),
      qloo = new QlooService(),
      agent = new LearningAgent({ repo, qloo, llm: new LLMProvider() }),
      actors = [];
    const app = createApp({
      repo,
      qloo,
      agent,
      verifyToken: (token) => admin.verifyIdToken(token, true),
      staticDir: resolve("dist"),
      logger: () => {},
    });
    let server, origin;
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
        signal: AbortSignal.timeout(240000),
      });
      return {
        status: response.status,
        headers: response.headers,
        data: response.status === 204 ? null : await response.json(),
      };
    }
    const expectStatus = (result, status) =>
      assert.equal(
        result.status,
        status,
        `Expected HTTP ${status}; got ${result.status} (${result.data?.error?.code || "no error code"})`,
      );
    try {
      // Confirm Admin access before creating test accounts, so a known access failure creates no orphans.
      try {
        await admin.getUser(`readiness-${randomUUID()}`);
      } catch (e) {
        if (e.code !== "auth/user-not-found") throw e;
      }
      await db.doc("learningMigrations/001_taste_learning").get();
      for (let i = 0; i < 2; i++) {
        const password = `Q!${randomUUID()}x7`,
          email = `learnbyquiz-live-${randomUUID()}@example.invalid`;
        const user = await admin.createUser({ email, password });
        actors.push({ uid: user.uid, email, password });
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.VITE_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
            signal: AbortSignal.timeout(20000),
          },
        );
        assert.equal(
          response.status,
          200,
          "Live Firebase Email/Password sign-in failed",
        );
        const data = await response.json();
        actors[i].token = data.idToken;
        assert.equal(
          data.localId,
          user.uid,
          "Browser API key and Admin target project must match",
        );
        const verified = await admin.verifyIdToken(data.idToken, true);
        assert.equal(
          verified.uid,
          user.uid,
          "Actual Firebase token verification failed",
        );
      }
      server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      origin = `http://127.0.0.1:${server.address().port}`;
      await t.test("production assets and protected API boundary", async () => {
        const html = await fetch(origin);
        assert.equal(html.status, 200);
        assert.ok(html.headers.get("content-security-policy"));
        expectStatus(await api("/taste/profile", { anonymous: true }), 401);
        expectStatus(
          await api("/taste/profile", { token: "invalid-live-test-token" }),
          401,
        );
        expectStatus(await api("/taste/profile"), 200);
        expectStatus(
          await api("/agents/generate-quiz", {
            method: "POST",
            body: { format: "essay" },
          }),
          400,
        );
      });
      let profile;
      await t.test(
        "live Qloo discovery and durable editable profile",
        async () => {
          const discovery = await api("/taste/discover", {
            method: "POST",
            body: { query: "Interstellar", type: "movie" },
          });
          expectStatus(discovery, 200);
          assert.ok(discovery.data.entities.length);
          profile = {
            interests: ["Science fiction", "Technology", "Space exploration"],
            subjects: ["Astronomy"],
            entities: discovery.data.entities
              .slice(0, 1)
              .map(({ entity_id, name, subtype }) => ({
                entity_id,
                name,
                subtype,
              })),
          };
          expectStatus(
            await api("/taste/profile", { method: "PUT", body: profile }),
            200,
          );
          const saved = await api("/taste/profile");
          expectStatus(saved, 200);
          assert.equal(saved.data.profile.entities.length, 1);
          assert.ok(saved.data.profile.entities[0].tags.length);
          const other = await api("/taste/profile", { actor: actors[1] });
          expectStatus(other, 200);
          assert.equal(other.data.profile, null);
          expectStatus(
            await api("/taste/profile", {
              method: "PUT",
              body: { ...profile, uid: actors[1].uid },
            }),
            400,
          );
          const edited = await api("/taste/profile", {
            method: "PUT",
            body: { ...profile, interests: ["Science fiction"] },
          });
          expectStatus(edited, 200);
          assert.equal(edited.data.profile.interests.length, 1);
          expectStatus(
            await api("/taste/profile", { method: "PUT", body: profile }),
            200,
          );
          const recs = await api("/taste/recommendations?type=book");
          expectStatus(recs, 200);
          assert.ok(recs.data.entities.length);
        },
      );
      await t.test(
        "direct browser Firestore access is denied to anonymous and authenticated owners",
        async () => {
          const url = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/learningUsers/${actors[0].uid}/profiles/taste`;
          for (const headers of [
            {},
            { Authorization: `Bearer ${actors[0].token}` },
          ]) {
            const response = await fetch(url, {
              headers,
              signal: AbortSignal.timeout(15000),
            });
            assert.equal(
              response.status,
              403,
              "Live Firestore rules must deny direct browser reads",
            );
          }
        },
      );
      await t.test("actual LLM learning planner", async () => {
        const result = await api("/agents/learning-plan", {
          method: "POST",
          body: {
            difficulty: "medium",
            format: "multiple",
            targetType: "book",
          },
        });
        expectStatus(result, 200);
        assert.equal(result.data.plan.subject, "Astronomy");
        assert.equal(result.data.quiz, null);
        assert.equal(result.data.execution.status, "completed");
      });
      let lastQuiz, lastResult;
      for (const difficulty of ["easy", "medium", "hard"])
        for (const format of ["multiple", "boolean"])
          await t.test(
            `actual ${difficulty} ${format} generation, review and transactional grading`,
            async () => {
              // Only records for this freshly-created test user are removed to reset adaptive state between matrix cases.
              for (const record of await repo.list(
                actors[0].uid,
                "performances",
                100,
              ))
                await repo
                  .ref(actors[0].uid, "performances", record.quizId)
                  .delete();
              const result = await api("/agents/generate-quiz", {
                method: "POST",
                body: { difficulty, format, targetType: "book" },
              });
              expectStatus(result, 200);
              const quiz = result.data.quiz;
              assert.equal(quiz.questions.length, 5);
              assert.ok(
                quiz.questions.every(
                  (q) =>
                    q.type === format &&
                    q.difficulty === difficulty &&
                    q.options.length === (format === "multiple" ? 4 : 2),
                ),
              );
              assert.ok(
                quiz.questions.every(
                  (q) => !("correctIndex" in q) && !("explanation" in q),
                ),
                "Answer keys must remain server-side",
              );
              assert.equal(result.data.execution.status, "completed");
              assert.ok(
                result.data.execution.steps.every(
                  (s) => s.status === "completed",
                ),
              );
              expectStatus(
                await api(`/learning/quizzes/${quiz.id}/start`, {
                  actor: actors[1],
                  method: "POST",
                }),
                404,
              );
              expectStatus(
                await api("/agents/analyze-performance", {
                  method: "POST",
                  body: { quizId: quiz.id, answers: [0, 0, 0, 0, 0] },
                }),
                409,
              );
              expectStatus(
                await api(`/learning/quizzes/${quiz.id}/start`, {
                  method: "POST",
                }),
                200,
              );
              const stored = await repo.get(actors[0].uid, "quizzes", quiz.id);
              // The last case intentionally answers incorrectly to verify the adaptive revision path.
              const wrong = difficulty === "hard" && format === "boolean";
              const answers = stored.questions.map((q) =>
                wrong
                  ? (q.correctIndex + 1) % q.options.length
                  : q.correctIndex,
              );
              const submit = () =>
                api("/agents/analyze-performance", {
                  method: "POST",
                  body: { quizId: quiz.id, answers },
                });
              const [first, duplicate] = await Promise.all([
                submit(),
                submit(),
              ]);
              expectStatus(first, 200);
              expectStatus(duplicate, 200);
              assert.equal(first.data.performance.accuracy, wrong ? 0 : 100);
              assert.equal(
                duplicate.data.performance.accuracy,
                first.data.performance.accuracy,
              );
              assert.equal(first.data.analytics.attempts, 1);
              const changed = await api("/agents/analyze-performance", {
                method: "POST",
                body: {
                  quizId: quiz.id,
                  answers: stored.questions.map(
                    (q) => (q.correctIndex + 1) % q.options.length,
                  ),
                },
              });
              expectStatus(changed, 200);
              assert.equal(
                changed.data.performance.accuracy,
                first.data.performance.accuracy,
              );
              const review = await api(`/learning/quizzes/${quiz.id}/start`, {
                method: "POST",
              });
              expectStatus(review, 200);
              assert.equal(review.data.performance.items.length, 5);
              lastQuiz = quiz;
              lastResult = first.data;
            },
          );
      await t.test(
        "actual adaptive next quiz prioritizes weak learning areas",
        async () => {
          assert.ok(
            lastResult,
            "The quiz matrix must complete before adaptation",
          );
          assert.equal(lastResult.analytics.nextDifficulty, "medium");
          assert.ok(
            lastResult.recommendations.some((r) => r.activity === "revision"),
          );
          const next = await api("/agents/generate-quiz", {
            method: "POST",
            body: {
              difficulty: "hard",
              format: "multiple",
              targetType: "book",
            },
          });
          expectStatus(next, 200);
          assert.equal(next.data.quiz.difficulty, "medium");
        },
      );
      await t.test(
        "durable dashboard, execution transparency and owner-only deletion",
        async () => {
          const dashboard = await api("/learning/dashboard");
          expectStatus(dashboard, 200);
          assert.ok(dashboard.data.quizzes.length >= 6);
          assert.equal(dashboard.data.analytics.attempts, 1);
          assert.ok(
            dashboard.data.executions.every((e) => e.status === "completed"),
          );
          expectStatus(
            await api(`/learning/quizzes/${lastQuiz.id}/start`, {
              actor: actors[1],
              method: "POST",
            }),
            404,
          );
          expectStatus(await api("/taste/profile", { method: "DELETE" }), 204);
          assert.equal((await api("/taste/profile")).data.profile, null);
          assert.ok(
            (await api("/learning/dashboard")).data.quizzes.length >= 6,
            "Deleting preferences must preserve learning history",
          );
        },
      );
      await t.test("real Firebase token revocation is enforced", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await admin.revokeRefreshTokens(actors[1].uid);
        expectStatus(await api("/taste/profile", { actor: actors[1] }), 401);
      });
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      const cleanups = await Promise.allSettled(
        actors.map(async (actor) => {
          await db.recursiveDelete(repo.user(actor.uid));
          await admin.deleteUser(actor.uid);
        }),
      );
      await db.terminate();
      await deleteApp(firebase);
      assert.ok(
        cleanups.every((result) => result.status === "fulfilled"),
        "Live test cleanup failed: remove only test accounts/documents created by this run before release",
      );
    }
  },
);
