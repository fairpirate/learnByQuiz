import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { AppError } from "./errors.js";
import {
  entityType,
  generationInput,
  profileInput,
  submissionSchema,
  text,
} from "./schemas.js";
import { analyzePerformance, recommend } from "./services/analytics.js";
import { publicQuiz } from "./services/agent.js";
export function createApp({
  repo,
  qloo,
  agent,
  verifyToken,
  logger = console.info,
  staticDir,
}) {
  const limited = (req, res) =>
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        requestId: req.requestId,
      },
    });
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "connect-src": [
            "'self'",
            "https://*.googleapis.com",
            "https://*.firebaseapp.com",
            "https://opentdb.com",
          ],
          "frame-src": ["'self'", "https://*.firebaseapp.com"],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("X-Request-Id", req.requestId);
    res.on("finish", () =>
      logger(
        JSON.stringify({
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
        }),
      ),
    );
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: limited,
    }),
  );
  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
    if (!match)
      return next(new AppError(401, "UNAUTHENTICATED", "Sign in to continue."));
    try {
      const token = await verifyToken(match[1]);
      if (!token.uid) throw new Error();
      req.uid = token.uid;
      next();
    } catch (error) {
      const providerFailure = [
        "auth/internal-error",
        "auth/insufficient-permission",
        "auth/invalid-credential",
        "app/invalid-credential",
        "app/network-error",
      ].includes(error.code);
      next(
        providerFailure
          ? new AppError(
              503,
              "AUTH_SERVICE_UNAVAILABLE",
              "Sign-in verification is temporarily unavailable. The administrator must check Firebase access.",
            )
          : new AppError(
              401,
              "UNAUTHENTICATED",
              "Your session expired. Please sign in again.",
            ),
      );
    }
  });
  app.use(express.json({ limit: "32kb" }));
  app.post("/api/taste/discover", async (req, res) => {
    const { query, type } = z
      .object({ query: text, type: entityType.optional() })
      .strict()
      .parse(req.body);
    res.json({
      entities: await qloo.searchEntities(query, type),
      source: "qloo",
    });
  });
  app.get("/api/taste/profile", async (req, res) =>
    res.json({ profile: await repo.get(req.uid, "profiles", "taste") }),
  );
  app.put("/api/taste/profile", async (req, res) => {
    const input = profileInput.parse(req.body);
    const selected = [
      ...new Map(input.entities.map((e) => [e.entity_id, e])).values(),
    ];
    // Resolve selected IDs against Qloo again; never persist client-invented cultural metadata.
    const entities = await Promise.all(
      selected.map(async (e) => {
        const type = entityType.parse(e.subtype.replace("urn:entity:", ""));
        const matches = await qloo.searchEntities(e.name, type);
        const canonical = matches.find(
          (x) => x.entity_id.toLowerCase() === e.entity_id.toLowerCase(),
        );
        if (!canonical)
          throw new AppError(
            400,
            "INVALID_ENTITY",
            "Select an entity returned by Qloo search.",
          );
        return canonical;
      }),
    );
    const profile = {
      ...input,
      entities,
      interests: [...new Set(input.interests)],
      subjects: [...new Set(input.subjects)],
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    await repo.put(req.uid, "profiles", "taste", profile);
    res.json({ profile });
  });
  app.delete("/api/taste/profile", async (req, res) => {
    await repo.deleteProfile(req.uid);
    res.status(204).end();
  });
  app.get("/api/taste/recommendations", async (req, res) => {
    const type = entityType.default("book").parse(req.query.type),
      profile = await repo.get(req.uid, "profiles", "taste");
    if (!profile)
      throw new AppError(
        409,
        "PROFILE_REQUIRED",
        "Save your taste profile first.",
      );
    res.json({
      entities: await qloo.getPersonalizedRecommendations(profile, type),
      source: "qloo",
    });
  });
  const expensive = rateLimit({
    windowMs: 3600000,
    limit: 10,
    keyGenerator: (req) => req.uid,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: limited,
  });
  const active = new Set();
  for (const [route, planOnly] of [
    ["learning-plan", true],
    ["generate-quiz", false],
  ])
    app.post(`/api/agents/${route}`, expensive, async (req, res) => {
      const input = generationInput.parse(req.body);
      if (active.has(req.uid))
        throw new AppError(
          409,
          "AGENT_BUSY",
          "An activity is already being prepared.",
        );
      active.add(req.uid);
      try {
        res.json(await agent.run(req.uid, input, planOnly));
      } finally {
        active.delete(req.uid);
      }
    });
  app.get("/api/agents/executions", async (req, res) =>
    res.json({ executions: await repo.list(req.uid, "executions", 10) }),
  );
  app.get("/api/learning/dashboard", async (req, res) => {
    const [profile, records, quizzes, plans, executions] = await Promise.all([
      repo.get(req.uid, "profiles", "taste"),
      repo.list(req.uid, "performances", 100),
      repo.list(req.uid, "quizzes", 20),
      repo.list(req.uid, "plans", 10),
      repo.list(req.uid, "executions", 10),
    ]);
    const analytics = analyzePerformance(records);
    res.json({
      profile,
      analytics,
      recommendations: recommend(profile, analytics),
      quizzes: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        subject: q.subject,
        difficulty: q.difficulty,
        createdAt: q.createdAt,
        completed: records.some((r) => r.quizId === q.id),
      })),
      plans,
      executions,
    });
  });
  app.post("/api/learning/quizzes/:id/start", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json({
      quiz: publicQuiz(await repo.startQuiz(req.uid, id)),
      performance: await repo.get(req.uid, "performances", id),
    });
  });
  app.post("/api/agents/analyze-performance", async (req, res) => {
    const { quizId, answers } = submissionSchema.parse(req.body);
    const result = await repo.submit(req.uid, quizId, (quiz) => {
      if (answers.some((a, i) => a >= quiz.questions[i].options.length))
        throw new AppError(
          400,
          "INVALID_ANSWERS",
          "An answer is outside the available options.",
        );
      const items = quiz.questions.map((q, i) => ({
        topic: q.topic,
        difficulty: q.difficulty,
        correct: answers[i] === q.correctIndex,
        answer: answers[i],
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        question: q.question,
      }));
      const correct = items.filter((x) => x.correct).length;
      return {
        quizId,
        createdAt: new Date().toISOString(),
        subject: quiz.subject,
        difficulty: quiz.difficulty,
        correct,
        total: items.length,
        accuracy: Math.round((100 * correct) / items.length),
        durationSeconds: Math.max(
          0,
          Math.round((Date.now() - Date.parse(quiz.startedAt)) / 1000),
        ),
        items,
      };
    });
    const analytics = analyzePerformance(
        await repo.list(req.uid, "performances", 100),
      ),
      profile = await repo.get(req.uid, "profiles", "taste");
    res.json({
      performance: result,
      analytics,
      recommendations: recommend(profile, analytics),
    });
  });
  app.use("/api", (_req, _res, next) =>
    next(new AppError(404, "NOT_FOUND", "API route not found.")),
  );
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get("/{*path}", (_req, res) => res.sendFile(`${staticDir}/index.html`));
  }
  app.use((err, req, res, _next) => {
    if ([4, 5, 7, 14].includes(err.code))
      return res.status(503).json({
        error: {
          code: "LEARNING_STORAGE_UNAVAILABLE",
          message:
            "Learning storage is currently unavailable. The administrator must check the database and its permissions.",
          requestId: req.requestId,
        },
      });
    const validation = err instanceof ZodError;
    if (err.type === "entity.parse.failed")
      return res.status(400).json({
        error: {
          code: "MALFORMED_JSON",
          message: "The request body must contain valid JSON.",
          requestId: req.requestId,
        },
      });
    if (err.type === "entity.too.large")
      return res.status(413).json({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "The request body exceeds the allowed size.",
          requestId: req.requestId,
        },
      });
    const status = validation ? 400 : err.status || 500;
    res.status(status).json({
      error: {
        code: validation ? "INVALID_INPUT" : err.code || "INTERNAL_ERROR",
        message: validation
          ? "Check the supplied fields and try again."
          : status >= 500 && !(err instanceof AppError)
            ? "The request could not be completed."
            : err.message,
        requestId: req.requestId,
      },
    });
  });
  return app;
}
