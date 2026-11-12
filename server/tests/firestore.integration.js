import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository } from "../repository.js";
import { draft, profile } from "./helpers.js";
test(
  "Firestore persistence, owner scoping and concurrent idempotent submissions",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    // Explicit emulator requirement prevents tests writing to a production project.
    const app = initializeApp(
        { projectId: "demo-learnbyquiz" },
        `test-${randomUUID()}`,
      ),
      db = getFirestore(app),
      repo = new FirestoreRepository(db),
      uid = `test-${randomUUID()}`,
      quizId = randomUUID();
    try {
      await repo.put(uid, "profiles", "taste", profile);
      assert.deepEqual(await repo.get(uid, "profiles", "taste"), profile);
      assert.equal(await repo.get("other-user", "profiles", "taste"), null);
      await repo.put(uid, "quizzes", quizId, {
        id: quizId,
        createdAt: new Date().toISOString(),
        questions: draft.questions,
      });
      await repo.startQuiz(uid, quizId);
      const build = () => ({
        quizId,
        createdAt: new Date().toISOString(),
        accuracy: 100,
      });
      const [a, b] = await Promise.all([
        repo.submit(uid, quizId, build),
        repo.submit(uid, quizId, build),
      ]);
      assert.deepEqual(a, b);
      assert.equal((await repo.list(uid, "performances")).length, 1);
      await assert.rejects(repo.startQuiz("other-user", quizId), {
        code: "QUIZ_NOT_FOUND",
      });
      // Real Firestore transactions arbitrate concurrent payment callbacks and credit usage.
      const purchaseId = randomUUID();
      await repo.createPurchase(uid, {
        id: purchaseId,
        credits: 10,
        status: "CREATED",
        createdAt: new Date().toISOString(),
      });
      await repo.attachOrder(
        uid,
        purchaseId,
        "ORDER123",
        "https://www.sandbox.paypal.com/checkoutnow",
      );
      await Promise.all(
        Array.from({ length: 5 }, () =>
          repo.settlePurchase(uid, purchaseId, "CAPTURE123"),
        ),
      );
      assert.equal((await repo.wallet(uid)).balance, 13);
      const reservations = Array.from({ length: 15 }, () => randomUUID());
      const reserved = await Promise.allSettled(
        reservations.map((id) => repo.reserveCredit(uid, id)),
      );
      assert.equal(reserved.filter((r) => r.status === "fulfilled").length, 13);
      assert.equal((await repo.wallet(uid)).balance, 0);
      const released =
        reservations[reserved.findIndex((r) => r.status === "fulfilled")];
      await Promise.all([
        repo.finishCredit(uid, released, false),
        repo.finishCredit(uid, released, false),
      ]);
      assert.equal((await repo.wallet(uid)).balance, 1);
      await Promise.all([
        repo.reversePurchase(uid, purchaseId),
        repo.reversePurchase(uid, purchaseId),
      ]);
      assert.equal((await repo.wallet(uid)).balance, -9);
      await repo.settlePurchase(uid, purchaseId, "CAPTURE123");
      assert.equal((await repo.wallet(uid)).balance, -9);
      await repo.deleteProfile(uid);
      assert.equal(await repo.get(uid, "profiles", "taste"), null);
    } finally {
      await db.recursiveDelete(repo.user(uid));
      await db.terminate();
      await deleteApp(app);
    }
  },
);
