import test from "node:test";
import assert from "node:assert/strict";
import { LearningAgent } from "../services/agent.js";
import { quizSchema, questionSchema } from "../schemas.js";
import { analyzePerformance, recommend } from "../services/analytics.js";
import {
  MemoryRepository,
  profile,
  entity,
  draft,
  fakeLLM,
} from "./helpers.js";
async function setup(llm = fakeLLM()) {
  const repo = new MemoryRepository();
  await repo.put("u", "profiles", "taste", profile);
  return {
    repo,
    agent: new LearningAgent({
      repo,
      qloo: { getPersonalizedRecommendations: async () => [entity] },
      llm,
    }),
  };
}
test("agent executes real logical tools, persists plan, quiz and completed trace; redacts answers", async () => {
  const { repo, agent } = await setup();
  const r = await agent.run("u", {
    difficulty: "medium",
    format: "multiple",
    targetType: "book",
  });
  assert.equal(r.execution.status, "completed");
  assert.equal(r.execution.steps.length, 6);
  assert.ok(r.execution.steps.every((s) => s.status === "completed"));
  assert.equal(r.quiz.questions[0].correctIndex, undefined);
  assert.equal(r.quiz.questions[0].explanation, undefined);
  assert.equal(
    (await repo.get("u", "quizzes", r.quiz.id)).questions[0].correctIndex,
    0,
  );
});
test("failed answer review persists failed trace and never stores rejected quiz", async () => {
  const llm = fakeLLM(),
    original = llm.callTool;
  llm.callTool = async (...args) =>
    args[0] === "review_quiz"
      ? { approved: false, issues: ["Wrong answer"] }
      : original(...args);
  const { repo, agent } = await setup(llm);
  await assert.rejects(
    agent.run("u", {
      difficulty: "medium",
      format: "multiple",
      targetType: "book",
    }),
    { code: "QUIZ_REJECTED" },
  );
  assert.equal((await repo.list("u", "quizzes")).length, 0);
  const trace = (await repo.list("u", "executions"))[0];
  assert.equal(trace.status, "failed");
  assert.equal(trace.steps.at(-1).status, "failed");
});
test("question validation rejects bad indexes, duplicate options/questions and malformed booleans", () => {
  assert.equal(
    questionSchema.safeParse({ ...draft.questions[0], correctIndex: 4 })
      .success,
    false,
  );
  assert.equal(
    questionSchema.safeParse({
      ...draft.questions[0],
      options: ["A", "A", "C", "D"],
    }).success,
    false,
  );
  assert.equal(
    questionSchema.safeParse({ ...draft.questions[0], type: "boolean" })
      .success,
    false,
  );
  assert.equal(
    quizSchema.safeParse({ questions: Array(5).fill(draft.questions[0]) })
      .success,
    false,
  );
});
test("performance controls recommendations and difficulty independently of taste", () => {
  const records = [
    {
      correct: 1,
      total: 5,
      accuracy: 20,
      durationSeconds: 42,
      difficulty: "medium",
      subject: "Astronomy",
      createdAt: new Date().toISOString(),
      items: Array.from({ length: 5 }, (_, i) => ({
        topic: "Gravity",
        difficulty: "medium",
        correct: i === 0,
      })),
    },
  ];
  const a = analyzePerformance(records);
  assert.equal(a.nextDifficulty, "easy");
  assert.equal(a.accuracy, 20);
  assert.equal(a.weakSubjects[0].topic, "Gravity");
  assert.equal(recommend(profile, a)[0].activity, "revision");
  const empty = analyzePerformance([]);
  assert.equal(empty.accuracy, null);
  assert.deepEqual(recommend(null, empty), []);
});
test("no profile fails before Qloo or LLM; no discovery prevents fabricated context", async () => {
  const { repo, agent } = await setup();
  await repo.deleteProfile("u");
  await assert.rejects(agent.run("u", {}), { code: "PROFILE_REQUIRED" });
  await repo.put("u", "profiles", "taste", profile);
  agent.qloo.getPersonalizedRecommendations = async () => [];
  await assert.rejects(agent.run("u", {}), { code: "NO_DISCOVERIES" });
});
test("plan-only mode stops before quiz tools and performance controls generation difficulty", async () => {
  const { repo, agent } = await setup();
  await repo.put("u", "performances", "recent", {
    correct: 1,
    total: 5,
    accuracy: 20,
    durationSeconds: 30,
    difficulty: "medium",
    subject: "Astronomy",
    createdAt: new Date().toISOString(),
    items: [{ topic: "Gravity", difficulty: "medium", correct: false }],
  });
  const original = agent.llm.callTool,
    tools = [];
  agent.llm.callTool = async (name, desc, params, context, schema) => {
    tools.push(name);
    assert.equal(context.difficulty, "easy");
    return original(name, desc, params, context, schema);
  };
  const result = await agent.run(
    "u",
    { difficulty: "hard", format: "boolean", targetType: "book" },
    true,
  );
  assert.equal(result.plan.difficulty, "easy");
  assert.deepEqual(tools, ["create_learning_plan"]);
  assert.equal(result.quiz, null);
  assert.equal((await repo.list("u", "quizzes")).length, 0);
});
test("true/false questions pass the full validation workflow", async () => {
  const llm = fakeLLM(),
    original = llm.callTool;
  llm.callTool = async (name, desc, params, context, schema) =>
    name === "generate_quiz"
      ? schema.parse({
          questions: draft.questions.map((q) => ({
            ...q,
            type: "boolean",
            options: ["True", "False"],
          })),
        })
      : original(name, desc, params, context, schema);
  const { agent } = await setup(llm);
  const result = await agent.run("u", {
    difficulty: "medium",
    format: "boolean",
    targetType: "book",
  });
  assert.equal(result.quiz.questions[0].options.length, 2);
  assert.equal(result.execution.status, "completed");
});
test("untrusted topic names cannot modify object prototypes during analytics", () => {
  const before = Object.prototype.total;
  const records = [
    {
      correct: 0,
      total: 1,
      accuracy: 0,
      durationSeconds: 1,
      difficulty: "medium",
      createdAt: new Date().toISOString(),
      items: [{ topic: "__proto__", difficulty: "medium", correct: false }],
    },
  ];
  const result = analyzePerformance(records);
  assert.equal(Object.prototype.total, before);
  assert.equal(result.subjects["__proto__"].total, 1);
  assert.equal(result.weakSubjects[0].topic, "__proto__");
});
