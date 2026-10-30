import test from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

test(
  "actual Firestore rules deny anonymous, owner and cross-user browser access",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const env = await initializeTestEnvironment({
      projectId: "demo-learnbyquiz",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
    try {
      await env.withSecurityRulesDisabled(async (context) => {
        await assertSucceeds(
          setDoc(
            doc(context.firestore(), "learningUsers/rules-test/profiles/taste"),
            { interests: ["Synthetic test interest"] },
          ),
        );
      });
      for (const context of [
        env.unauthenticatedContext(),
        env.authenticatedContext("rules-test"),
        env.authenticatedContext("other-test"),
      ]) {
        await assertFails(
          getDoc(
            doc(context.firestore(), "learningUsers/rules-test/profiles/taste"),
          ),
        );
        await assertFails(
          setDoc(
            doc(context.firestore(), "learningUsers/rules-test/profiles/taste"),
            { interests: [] },
          ),
        );
        await assertFails(
          getDoc(
            doc(context.firestore(), "learningMigrations/001_taste_learning"),
          ),
        );
      }
    } finally {
      await env.clearFirestore();
      await env.cleanup();
    }
  },
);
