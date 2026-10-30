import "dotenv/config";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { FirestoreRepository } from "./repository.js";
import { QlooService } from "./services/qloo.js";
import { LLMProvider } from "./services/llm.js";
import { LearningAgent } from "./services/agent.js";
initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const repo = new FirestoreRepository(getFirestore()),
  qloo = new QlooService(),
  llm = new LLMProvider();
const app = createApp({
  repo,
  qloo,
  agent: new LearningAgent({ repo, qloo, llm }),
  verifyToken: (token) => getAuth().verifyIdToken(token, true),
  staticDir:
    process.env.NODE_ENV === "production" ? resolve("dist") : undefined,
});
const server = app.listen(Number(process.env.PORT) || 3001, () =>
  console.info("LearnByQuiz API listening"),
);
server.requestTimeout = 240000;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 250000).unref();
  });
