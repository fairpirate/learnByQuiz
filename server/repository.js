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
