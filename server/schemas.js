import { z } from "zod";
export const text = z.string().trim().min(1).max(500);
export const difficulty = z.enum(["easy", "medium", "hard"]);
export const entityTypes = [
  "movie",
  "tv_show",
  "book",
  "artist",
  // The guide says video_game, but the linked schema and live hackathon API use videogame.
  "videogame",
  "destination",
  "place",
  "brand",
  "podcast",
  "person",
];
export const entityType = z.enum(entityTypes);
export const entity = z.object({
  entity_id: z.string().uuid(),
  name: text,
  subtype: z.string().startsWith("urn:entity:"),
  tags: z
    .array(z.object({ id: text, name: text }))
    .max(100)
    .default([]),
  affinity: z.number().finite().nullable().default(null),
});
export const profileInput = z
  .object({
    interests: z.array(text).max(20),
    subjects: z.array(text).min(1).max(10),
    entities: z.array(entity).min(1).max(15),
  })
  .strict();
export const generationInput = z
  .object({
    difficulty: difficulty.default("medium"),
    format: z.enum(["multiple", "boolean"]).default("multiple"),
    targetType: entityType.default("book"),
  })
  .strict();
export const planSchema = z.object({
  title: text,
  subject: text,
  concepts: z.array(text).min(1).max(5),
  explanation: text,
});
export const questionSchema = z
  .object({
    question: text,
    options: z.array(text).min(2).max(4),
    correctIndex: z.number().int().min(0).max(3),
    explanation: text,
    topic: text,
    difficulty,
    type: z.enum(["multiple", "boolean"]),
  })
  .superRefine((q, ctx) => {
    if (
      new Set(q.options.map((x) => x.toLowerCase())).size !==
        q.options.length ||
      q.correctIndex >= q.options.length ||
      (q.type === "multiple" && q.options.length !== 4) ||
      (q.type === "boolean" && JSON.stringify(q.options) !== '["True","False"]')
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid or ambiguous answer options",
      });
  });
export const quizSchema = z
  .object({ questions: z.array(questionSchema).length(5) })
  .superRefine((q, ctx) => {
    if (new Set(q.questions.map((x) => x.question.toLowerCase())).size !== 5)
      ctx.addIssue({ code: "custom", message: "Duplicate questions" });
  });
export const submissionSchema = z
  .object({
    quizId: z.string().uuid(),
    answers: z.array(z.number().int().min(0).max(3)).length(5),
  })
  .strict();
