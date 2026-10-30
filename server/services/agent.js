import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors.js";
import { planSchema, quizSchema } from "../schemas.js";
import { analyzePerformance, recommend } from "./analytics.js";
const str = { type: "string" };
const planParameters = {
  type: "object",
  properties: {
    title: str,
    subject: str,
    concepts: { type: "array", items: str },
    explanation: str,
  },
  required: ["title", "subject", "concepts", "explanation"],
  additionalProperties: false,
};
const quizParameters = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: str,
          options: { type: "array", items: str },
          correctIndex: { type: "integer" },
          explanation: str,
          topic: str,
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          type: { type: "string", enum: ["multiple", "boolean"] },
        },
        required: [
          "question",
          "options",
          "correctIndex",
          "explanation",
          "topic",
          "difficulty",
          "type",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};
const reviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()).max(20),
});
const reviewParameters = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    issues: { type: "array", items: str },
  },
  required: ["approved", "issues"],
  additionalProperties: false,
};
export function publicQuiz(quiz) {
  return {
    ...quiz,
    questions: quiz.questions.map(({ correctIndex, explanation, ...q }) => q),
  };
}
export class LearningAgent {
  constructor({ repo, qloo, llm }) {
    this.repo = repo;
    this.qloo = qloo;
    this.llm = llm;
  }
  async run(uid, input, planOnly = false) {
    const execution = {
      id: randomUUID(),
      status: "running",
      createdAt: new Date().toISOString(),
      steps: [],
    };
    const save = () =>
      this.repo.put(uid, "executions", execution.id, execution);
    await save();
    const step = async (name, fn) => {
      const s = {
        name,
        status: "running",
        startedAt: new Date().toISOString(),
      };
      execution.steps.push(s);
      await save();
      try {
        const result = await fn();
        s.status = "completed";
        s.durationMs = Date.now() - Date.parse(s.startedAt);
        await save();
        return result;
      } catch (e) {
        s.status = "failed";
        s.durationMs = Date.now() - Date.parse(s.startedAt);
        s.error =
          e instanceof AppError ? e.message : "The step could not complete.";
        throw e;
      }
    };
    try {
      const profile = await step("Read learner preferences", async () => {
        const p = await this.repo.get(uid, "profiles", "taste");
        if (!p)
          throw new AppError(
            409,
            "PROFILE_REQUIRED",
            "Save your taste profile first.",
          );
        return p;
      });
      const discoveries = await step(
        "Discover related culture with Qloo",
        async () => {
          const entities = await this.qloo.getPersonalizedRecommendations(
            profile,
            input.targetType,
          );
          if (!entities.length)
            throw new AppError(
              422,
              "NO_DISCOVERIES",
              "Qloo found no related entities. Try another discovery category.",
            );
          return entities;
        },
      );
      const records = await this.repo.list(uid, "performances", 100);
      const analytics = analyzePerformance(records),
        recommendations = recommend(profile, analytics);
      const effectiveDifficulty = records.length
        ? analytics.nextDifficulty
        : input.difficulty;
      const plan = await step("Plan educational subjects with AI", () =>
        this.llm.callTool(
          "create_learning_plan",
          "Map cultural context to a selected educational subject. Prioritize the recommended revision topic. Explain the cultural connection without claiming Qloo supplied educational facts.",
          planParameters,
          {
            profile,
            discoveries,
            recommendations,
            difficulty: effectiveDifficulty,
            allowedSubjects: profile.subjects,
          },
          planSchema,
        ),
      );
      if (
        !profile.subjects.some(
          (s) => s.toLowerCase() === plan.subject.toLowerCase(),
        )
      )
        throw new AppError(
          502,
          "INVALID_PLAN",
          "The AI plan did not use a selected subject. Please regenerate.",
        );
      const planRecord = {
        ...plan,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        difficulty: effectiveDifficulty,
        discoveries,
        source: "ai",
        executionId: execution.id,
      };
      await this.repo.put(uid, "plans", planRecord.id, planRecord);
      let quiz;
      if (!planOnly) {
        const draft = await step("Generate educational quiz with AI", () =>
          this.llm.callTool(
            "generate_quiz",
            "Generate exactly five accurate educational questions. Multiple choice has four distinct options; boolean has exactly [True, False]. Include explanations. Match requested difficulty and format. Cultural references are optional context, never substitute for actual subject knowledge.",
            quizParameters,
            { plan, difficulty: effectiveDifficulty, format: input.format },
            quizSchema,
          ),
        );
        if (
          draft.questions.some(
            (q) =>
              q.difficulty !== effectiveDifficulty || q.type !== input.format,
          )
        )
          throw new AppError(
            502,
            "INVALID_QUIZ",
            "Quiz did not match the requested format or difficulty.",
          );
        await step("Review answers and educational accuracy", async () => {
          const review = await this.llm.callTool(
            "review_quiz",
            "Independently solve every question. Check each answer index and explanation for factual accuracy, ambiguity, and educational relevance to the plan. Approve only if all five are sound; report uncertainty as an issue.",
            reviewParameters,
            { plan, quiz: draft },
            reviewSchema,
          );
          if (!review.approved || review.issues.length)
            throw new AppError(
              502,
              "QUIZ_REJECTED",
              "The answer review found uncertain content. Please regenerate.",
            );
        });
        quiz = {
          id: randomUUID(),
          title: plan.title,
          subject: plan.subject,
          difficulty: effectiveDifficulty,
          createdAt: new Date().toISOString(),
          questions: draft.questions,
          planId: planRecord.id,
          executionId: execution.id,
          source: "ai",
          startedAt: null,
        };
        await step("Save personalized learning activity", () =>
          this.repo.put(uid, "quizzes", quiz.id, quiz),
        );
      }
      execution.status = "completed";
      execution.durationMs = Date.now() - Date.parse(execution.createdAt);
      execution.resultId = quiz?.id || planRecord.id;
      await save();
      return {
        execution,
        plan: planRecord,
        quiz: quiz ? publicQuiz(quiz) : null,
      };
    } catch (e) {
      execution.status = "failed";
      execution.error =
        e instanceof AppError ? e.message : "The learning workflow failed.";
      execution.durationMs = Date.now() - Date.parse(execution.createdAt);
      await save();
      throw e;
    }
  }
}
