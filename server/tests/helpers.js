import { AppError } from "../errors.js";
export class MemoryRepository {
  constructor() {
    this.data = new Map();
  }
  key(uid, kind, id) {
    return `${uid}/${kind}/${id}`;
  }
  async get(uid, kind, id) {
    return structuredClone(this.data.get(this.key(uid, kind, id)) || null);
  }
  async put(uid, kind, id, data) {
    this.data.set(this.key(uid, kind, id), structuredClone(data));
    return data;
  }
  async list(uid, kind, limit = 50) {
    return [...this.data.entries()]
      .filter(([k]) => k.startsWith(`${uid}/${kind}/`))
      .map(([, v]) => structuredClone(v))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async deleteProfile(uid) {
    this.data.delete(this.key(uid, "profiles", "taste"));
  }
  async startQuiz(uid, id) {
    const q = await this.get(uid, "quizzes", id);
    if (!q) throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    q.startedAt ||= new Date().toISOString();
    await this.put(uid, "quizzes", id, q);
    return q;
  }
  async submit(uid, id, build) {
    const existing = await this.get(uid, "performances", id);
    if (existing) return existing;
    const q = await this.get(uid, "quizzes", id);
    if (!q) throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    if (!q.startedAt)
      throw new AppError(409, "QUIZ_NOT_STARTED", "Start quiz first.");
    const r = build(q);
    await this.put(uid, "performances", id, r);
    return r;
  }
}
export const entity = {
  entity_id: "369d1544-628b-4c21-95a0-1488117a308a",
  name: "Favorite movie",
  subtype: "urn:entity:movie",
  tags: [],
  affinity: null,
};
export const profile = {
  interests: ["Science fiction", "Technology", "Space exploration"],
  subjects: ["Astronomy"],
  entities: [entity],
};
export const draft = {
  questions: Array.from({ length: 5 }, (_, i) => ({
    question: `Educational question ${i}?`,
    options: ["A", "B", "C", "D"],
    correctIndex: 0,
    explanation: "Test explanation",
    topic: "Astronomy",
    difficulty: "medium",
    type: "multiple",
  })),
};
export function fakeLLM() {
  return {
    callTool: async (name, _desc, _params, _context, schema) =>
      schema.parse(
        name === "create_learning_plan"
          ? {
              title: "Astronomy through culture",
              subject: "Astronomy",
              concepts: ["Gravity"],
              explanation: "Astronomy connects to your interest in space.",
            }
          : name === "generate_quiz"
            ? draft
            : { approved: true, issues: [] },
      ),
  };
}
