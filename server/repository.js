import { AppError } from "./errors.js";
// Only new v1 collections are used; existing Firebase users and quiz data are untouched.
export class FirestoreRepository {
  constructor(db) {
    this.db = db;
  }
  user(uid) {
    return this.db.collection("learningUsers").doc(uid);
  }
  ref(uid, kind, id) {
    return this.user(uid).collection(kind).doc(id);
  }
  async get(uid, kind, id) {
    const s = await this.ref(uid, kind, id).get();
    return s.exists ? s.data() : null;
  }
  async put(uid, kind, id, value) {
    await this.ref(uid, kind, id).set(JSON.parse(JSON.stringify(value)));
    return value;
  }
  async list(uid, kind, limit = 50) {
    const s = await this.user(uid)
      .collection(kind)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return s.docs.map((d) => d.data());
  }
  async createPurchase(uid, purchase) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.ref(uid, "purchases", purchase.id),
        doc = await tx.get(ref);
      if (doc.exists) return doc.data();
      tx.create(ref, purchase);
      return purchase;
    });
  }
  async attachOrder(uid, id, orderId, approvalUrl) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.ref(uid, "purchases", id),
        doc = await tx.get(ref);
      const value = { ...doc.data(), orderId, approvalUrl };
      if (doc.data().orderId && doc.data().orderId !== orderId)
        throw new AppError(
          409,
          "ORDER_CONFLICT",
          "Checkout already has a payment order.",
        );
      tx.set(ref, value);
      return value;
    });
  }
  async wallet(uid) {
    return (await this.get(uid, "billing", "wallet")) || { balance: 3 };
  }
  async settlePurchase(uid, id, captureId) {
    return this.db.runTransaction(async (tx) => {
      const purchaseRef = this.ref(uid, "purchases", id),
        walletRef = this.ref(uid, "billing", "wallet");
      const [purchase, wallet] = await Promise.all([
        tx.get(purchaseRef),
        tx.get(walletRef),
      ]);
      if (!purchase.exists)
        throw new AppError(404, "PURCHASE_NOT_FOUND", "Payment not found.");
      const value = purchase.data();
      if (value.status === "COMPLETED" || value.status === "REVERSED")
        return value;
      const settled = {
        ...value,
        status: "COMPLETED",
        captureId,
        completedAt: new Date().toISOString(),
      };
      tx.set(purchaseRef, settled);
      tx.set(walletRef, {
        balance: (wallet.exists ? wallet.data().balance : 3) + value.credits,
      });
      return settled;
    });
  }
  async reversePurchase(uid, id) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.ref(uid, "purchases", id),
        walletRef = this.ref(uid, "billing", "wallet");
      const [doc, wallet] = await Promise.all([tx.get(ref), tx.get(walletRef)]);
      if (!doc.exists || doc.data().status === "REVERSED") return;
      const purchase = doc.data();
      tx.set(ref, {
        ...purchase,
        status: "REVERSED",
        reversedAt: new Date().toISOString(),
      });
      if (purchase.status === "COMPLETED")
        tx.set(walletRef, {
          balance:
            (wallet.exists ? wallet.data().balance : 3) - purchase.credits,
        });
    });
  }
  async reserveCredit(uid, id) {
    return this.db.runTransaction(async (tx) => {
      const walletRef = this.ref(uid, "billing", "wallet"),
        reservationRef = this.ref(uid, "creditReservations", id);
      const wallet = await tx.get(walletRef);
      const balance = wallet.exists ? wallet.data().balance : 3;
      if (balance < 1)
        throw new AppError(
          402,
          "CREDITS_REQUIRED",
          "Buy a learning pack to generate more AI activities.",
        );
      tx.set(walletRef, { balance: balance - 1 });
      tx.create(reservationRef, {
        id,
        status: "RESERVED",
        createdAt: new Date().toISOString(),
      });
    });
  }
  async finishCredit(uid, id, success) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.ref(uid, "creditReservations", id),
        walletRef = this.ref(uid, "billing", "wallet");
      const [doc, wallet] = await Promise.all([tx.get(ref), tx.get(walletRef)]);
      if (!doc.exists || doc.data().status !== "RESERVED") return;
      tx.update(ref, { status: success ? "CONSUMED" : "RELEASED" });
      if (!success) tx.set(walletRef, { balance: wallet.data().balance + 1 });
    });
  }
  async deleteProfile(uid) {
    await this.ref(uid, "profiles", "taste").delete();
  }
  async submit(uid, quizId, build) {
    return this.db.runTransaction(async (tx) => {
      const quizRef = this.ref(uid, "quizzes", quizId),
        performanceRef = this.ref(uid, "performances", quizId);
      const [quiz, existing] = await Promise.all([
        tx.get(quizRef),
        tx.get(performanceRef),
      ]);
      if (!quiz.exists)
        throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
      if (existing.exists) return existing.data();
      if (!quiz.data().startedAt)
        throw new AppError(
          409,
          "QUIZ_NOT_STARTED",
          "Start the quiz before submitting.",
        );
      const result = build(quiz.data());
      tx.set(performanceRef, result);
      return result;
    });
  }
  async startQuiz(uid, id) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.ref(uid, "quizzes", id),
        doc = await tx.get(ref);
      if (!doc.exists)
        throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
      const quiz = doc.data();
      if (!quiz.startedAt)
        tx.update(ref, { startedAt: new Date().toISOString() });
      return { ...quiz, startedAt: quiz.startedAt || new Date().toISOString() };
    });
  }
}
