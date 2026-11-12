import "dotenv/config";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { inspectConfiguration } from "./readiness.js";
import { runtimeConfiguration } from "./runtime-config.js";
import { createApp } from "./app.js";
import { FirestoreRepository } from "./repository.js";
import { QlooService } from "./services/qloo.js";
import { LLMProvider } from "./services/llm.js";
import { PayPalService } from "./services/paypal.js";
import { LearningAgent } from "./services/agent.js";
const runtime = runtimeConfiguration();
if (process.env.NODE_ENV === "production") {
  const configuration = inspectConfiguration(process.env, { browser: false });
  if (!configuration.ok)
    throw new Error(
      `Invalid server configuration: ${configuration.errors.join("; ")}`,
    );
  if (
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new Error("Production must use real Firebase services");
  if (!existsSync(resolve("dist/index.html")))
    throw new Error("Production assets are missing; run npm run build first");
}
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
  paypal: new PayPalService({ repo }),
  agent: new LearningAgent({ repo, qloo, llm }),
  verifyToken: (token) => getAuth().verifyIdToken(token, true),
  trustProxy: runtime.trustProxy,
  staticDir:
    process.env.NODE_ENV === "production" ? resolve("dist") : undefined,
});
const server = app.listen(runtime.port, () =>
  console.info("LearnByQuiz API listening"),
);
server.requestTimeout = 240000;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 250000).unref();
  });
