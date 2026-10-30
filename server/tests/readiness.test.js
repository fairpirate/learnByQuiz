import test from "node:test";
import assert from "node:assert/strict";
import { inspectConfiguration, providerFailure } from "../readiness.js";
const configured = {
  VITE_API_KEY: "public-firebase-config",
  VITE_AUTH_DOMAIN: "demo.firebaseapp.com",
  VITE_PROJECT_ID: "demo",
  VITE_APP_ID: "demo-app",
  FIREBASE_PROJECT_ID: "demo",
  QLOO_API_KEY: "private",
  LLM_API_KEY: "private",
  LLM_MODEL: "model",
  QLOO_BASE_URL: "https://hackathon.api.qloo.com",
  LLM_BASE_URL: "https://api.openai.com/v1",
};
test("release configuration checks required values and project consistency without exposing secrets", () => {
  assert.equal(inspectConfiguration(configured).ok, true);
  const missing = inspectConfiguration({ ...configured, LLM_API_KEY: "" });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.includes("LLM_API_KEY is missing"));
  const mismatched = inspectConfiguration({
    ...configured,
    VITE_PROJECT_ID: "other",
  });
  assert.equal(mismatched.ok, false);
  const unsafe = inspectConfiguration({
    ...configured,
    LLM_BASE_URL: "https://user:private@example.com/v1?key=private",
  });
  assert.equal(unsafe.ok, false);
  assert.ok(!JSON.stringify(unsafe).includes("user:private"));
});
test("live provider diagnostics distinguish disabled services, IAM and billing and redact upstream content", () => {
  assert.equal(
    providerFailure({ code: 7, message: "SERVICE_DISABLED" }).code,
    "SERVICE_DISABLED",
  );
  assert.equal(providerFailure({ code: 7 }).code, "PERMISSION_DENIED");
  assert.equal(
    providerFailure({ code: "LLM_BILLING_REQUIRED" }).code,
    "LLM_BILLING_REQUIRED",
  );
  const unexpected = providerFailure({
    code: "unknown",
    message: "secret key and private response",
  });
  assert.ok(!unexpected.message.includes("secret key"));
});
