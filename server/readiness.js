import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";

export function inspectConfiguration(env = process.env) {
  const required = [
    "VITE_API_KEY",
    "VITE_AUTH_DOMAIN",
    "VITE_PROJECT_ID",
    "VITE_APP_ID",
    "FIREBASE_PROJECT_ID",
    "QLOO_API_KEY",
    "LLM_API_KEY",
    "LLM_MODEL",
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  const errors = missing.map((key) => `${key} is missing`),
    warnings = [];
  if (
    env.VITE_PROJECT_ID &&
    env.FIREBASE_PROJECT_ID &&
    env.VITE_PROJECT_ID !== env.FIREBASE_PROJECT_ID
  )
    errors.push("Browser and server Firebase project IDs differ");
  for (const key of ["QLOO_BASE_URL", "LLM_BASE_URL"]) {
    if (!env[key]) continue;
    try {
      const u = new URL(env[key]);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        errors.push(
          `${key} must be an HTTPS URL without credentials, query parameters or fragments`,
        );
    } catch {
      errors.push(`${key} is invalid`);
    }
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const credential = JSON.parse(
        readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"),
      );
      if (credential.type === "service_account") {
        createPrivateKey(credential.private_key);
        if (credential.project_id !== env.FIREBASE_PROJECT_ID)
          warnings.push(
            "The service account belongs to a different project; verify intentional cross-project IAM access",
          );
      }
    } catch {
      errors.push(
        "GOOGLE_APPLICATION_CREDENTIALS must reference a readable, valid credential file",
      );
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function providerFailure(error) {
  const code = String(error.code || error.errorInfo?.code || "UNKNOWN");
  const message = String(
    error.details || error.errorInfo?.message || error.message || "",
  );
  if (
    /USER_PROJECT_DENIED|serviceusage.services.use|permission to use project/i.test(
      message,
    )
  )
    return {
      code: "QUOTA_PROJECT_DENIED",
      message:
        "Grant Service Usage Consumer to the service account in the configured Google quota project.",
    };
  if (
    /SERVICE_DISABLED|has not been used|accessNotConfigured|console\.developers\.google\.com\/apis\/api/.test(
      message,
    )
  )
    return {
      code: "SERVICE_DISABLED",
      message:
        "Enable this Google API in the configured Firebase project and retry.",
    };
  if (
    code === "7" ||
    /permission-denied|PERMISSION_DENIED|insufficient-permission/.test(
      code + message,
    )
  )
    return {
      code: "PERMISSION_DENIED",
      message:
        "The configured service account cannot access the target Firebase project.",
    };
  if (code === "5" || /NOT_FOUND/.test(message))
    return {
      code: "DATABASE_NOT_FOUND",
      message:
        "Create the default Firestore database in the configured Firebase project.",
    };
  const known = {
    LLM_BILLING_REQUIRED:
      "The LLM provider reports exhausted credit or quota; update billing or the configured key.",
    LLM_AUTH_FAILED:
      "The LLM provider denied access; check the configured key and model permissions.",
    LLM_RATE_LIMIT: "The LLM provider is temporarily rate limited.",
    LLM_MODEL_UNAVAILABLE: "The configured LLM model is unavailable.",
    LLM_INVALID_OUTPUT: "The LLM tool-call output failed schema validation.",
    QLOO_AUTH_FAILED:
      "Qloo authentication failed; verify the key and hackathon base URL.",
  };
  return {
    code: /^[a-zA-Z0-9_\/-]+$/.test(code) ? code : "UNKNOWN",
    message:
      known[code] ||
      "The live service check failed; inspect the provider configuration.",
  };
}
