import "dotenv/config";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const db = getFirestore();
const migration = db.collection("learningMigrations").doc("001_taste_learning");
await db.runTransaction(async (tx) => {
  const current = await tx.get(migration);
  if (current.exists) {
    console.info("Migration 001 already applied.");
    return;
  }
  tx.create(migration, {
    version: 1,
    appliedAt: new Date().toISOString(),
    collections: ["profiles", "plans", "quizzes", "performances", "executions"],
    userRoot: "learningUsers",
    description:
      "Additive learning storage. Firestore creates collections on first write; existing users and data are unchanged.",
  });
});
console.info(
  "Learning schema ready. Merge firestore.rules into existing rules before deployment.",
);
