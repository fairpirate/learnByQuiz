import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import {
  initializeApp,
  applicationDefault,
  deleteApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const origin = new URL(
  process.env.LIVE_TEST_ORIGIN || "https://learnbyquiz.spiritedrobot.in",
).origin;
const report = {
  checkedAt: new Date().toISOString(),
  origin,
  browserRequestsMocked: false,
  checks: [],
  cleanup: "pending",
  limitations: [],
};
const screenshots = "test-results/live-journey";
await mkdir(screenshots, { recursive: true });
const firebase = initializeApp(
  {
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  },
  `journey-live-${randomUUID()}`,
);
const admin = getAuth(firebase),
  db = getFirestore(firebase);
db.settings({ preferRest: true });
const email = `learnbyquiz-journey-${randomUUID()}@example.invalid`,
  password = `Q!${randomUUID()}x7`;
let browser, page, token, uid, account, quizId;
const runtimeErrors = [],
  apiFailures = [];
async function check(name, run) {
  const start = Date.now();
  try {
    await run();
    report.checks.push({
      name,
      status: "passed",
      durationMs: Date.now() - start,
    });
  } catch (error) {
    report.checks.push({
      name,
      status: "failed",
      reason: String(error.message).split("\n")[0].slice(0, 240),
      durationMs: Date.now() - start,
    });
  }
  console.info(JSON.stringify(report.checks.at(-1)));
}
async function api(path, { method = "GET", body } = {}) {
  assert.ok(token, "Real sign-in must succeed before authenticated checks");
  const response = await page.request.fetch(`${origin}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(body ? { data: body } : {}),
    timeout: 210000,
  });
  const data = response.status() === 204 ? null : await response.json();
  return { status: response.status(), data };
}
try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", () => runtimeErrors.push(true));
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes("accounts:signInWithPassword") && response.ok()) {
      const data = await response.json();
      token = data.idToken;
    }
    if (
      url.origin === origin &&
      url.pathname.startsWith("/api/") &&
      response.status() >= 400
    )
      apiFailures.push({
        path: url.pathname.replace(/[a-f0-9-]{36}/gi, ":id"),
        status: response.status(),
      });
  });
  await check(
    "Public deployment, registration form and terms consent",
    async () => {
      await page.goto(`${origin}/register`);
      await page.locator('input[name="name"]').fill("Live Journey QA");
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('input[name="confirmPw"]').fill(password);
      assert.equal(
        await page
          .getByRole("button", { name: "Sign Up", exact: true })
          .isDisabled(),
        true,
      );
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Sign Up", exact: true }).click();
      await page.waitForURL(
        (url) =>
          url.origin === origin && ["/", "/login"].includes(url.pathname),
      );
      const user = await admin.getUserByEmail(email);
      uid = user.uid;
    },
  );
  await check(
    "Real email/password login and authenticated Journey navigation",
    async () => {
      assert.ok(uid, "Registration must succeed first");
      await page.getByRole("button", { name: "Logout", exact: true }).waitFor();
      await page.getByRole("button", { name: "Logout", exact: true }).click();
      await page.waitForURL(`${origin}/login`);
      await page.goto(`${origin}/login`);
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL(`${origin}/`);
      await page
        .getByRole("link", { name: "AI Learning Journey", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Your AI Learning Journey" })
        .waitFor();
      const dashboard = await api("/learning/dashboard");
      assert.equal(
        dashboard.status,
        200,
        "Live dashboard must load for a new account",
      );
      assert.equal(dashboard.data.profile, null);
      await page.screenshot({
        path: `${screenshots}/desktop-new-account.png`,
        fullPage: true,
      });
    },
  );
  await check(
    "Live PayPal account configuration and new-user credits",
    async () => {
      const result = await api("/payments/account");
      assert.equal(result.status, 200);
      account = result.data;
      report.payments = {
        enabled: account.enabled,
        environment: account.environment,
        initialCredits: account.wallet?.balance,
        packCount: account.packs.length,
      };
      if (account.enabled) assert.equal(account.wallet.balance, 3);
      assert.ok(
        account.packs.every(
          (pack) => Number(pack.amount) > 0 && pack.credits > 0,
        ),
      );
      report.limitations.push(
        "Buyer approval, capture, refunds and signed webhook delivery require an interactive sandbox buyer and have not been proven by opening checkout.",
      );
    },
  );
  await check(
    "Select interests, discover a favorite and save preferences through the UI",
    async () => {
      assert.ok(uid && token, "Sign-in must succeed first");
      for (const name of [
        "Science fiction",
        "Technology",
        "Space exploration",
      ]) {
        const input = page.getByLabel(name, { exact: true });
        await input.click();
        await expect(input).toBeChecked();
      }
      const query = page.locator("#taste-query");
      await query.fill("Interstellar");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const response = await api("/taste/discover", {
        method: "POST",
        body: { query: "Interstellar", type: "movie" },
      });
      report.discovery = {
        status: response.status,
        source: response.data?.source,
        resultCount: response.data?.entities?.length,
      };
      const add = page
        .getByRole("button", { name: "Add", exact: true })
        .first();
      await add.waitFor({ timeout: 20000 });
      await add.click();
      const save = page.getByRole("button", {
        name: "Save preferences",
        exact: true,
      });
      await expect(
        save,
        "A new user must be able to save preferences",
      ).toBeEnabled();
      await save.click();
      await page
        .getByRole("status")
        .filter({ hasText: "Taste profile saved" })
        .waitFor();
      const saved = await api("/taste/profile");
      assert.equal(saved.status, 200);
      assert.ok(saved.data.profile);
    },
  );
  await check("Generate a real AI quiz from the Journey page", async () => {
    const button = page.getByRole("button", {
      name: "Generate personalized quiz",
      exact: true,
    });
    await expect(
      button,
      "Quiz generation is disabled for the completed profile",
    ).toBeEnabled();
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/agents/generate-quiz",
      { timeout: 210000 },
    );
    await button.click();
    const result = await response;
    const data = await result.json();
    assert.equal(
      result.status(),
      200,
      `Quiz generation failed (${data.error?.code || "unknown"})`,
    );
    quizId = data.quiz.id;
    assert.equal(data.quiz.questions.length, 5);
    assert.ok(
      data.quiz.questions.every(
        (q) => !("correctIndex" in q) && !("explanation" in q),
      ),
    );
    await page
      .getByRole("button", { name: "Start quiz", exact: true })
      .first()
      .waitFor();
  });
  await check(
    "Start popup, answer preservation, submit, review and saved analytics",
    async () => {
      assert.ok(quizId, "Real quiz generation must succeed first");
      await page
        .getByRole("button", { name: "Start quiz", exact: true })
        .first()
        .click();
      let dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.locator('input[name="q0"]').first().click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Start quiz", exact: true })
        .first()
        .click();
      dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await expect(dialog.locator('input[name="q0"]').first()).toBeChecked();
      for (let i = 1; i < 5; i++) {
        await dialog.locator(`input[name="q${i}"]`).first().click();
      }
      const grading = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/agents/analyze-performance",
        { timeout: 30000 },
      );
      await dialog.getByRole("button", { name: "Finish & analyze" }).click();
      const response = await grading,
        result = await response.json();
      assert.equal(response.status(), 200);
      assert.equal(result.performance.items.length, 5);
      await dialog
        .getByRole("region", { name: "Quiz answer review" })
        .waitFor();
      await page.screenshot({
        path: `${screenshots}/desktop-real-quiz-review.png`,
      });
      await dialog
        .getByRole("button", { name: "Close quiz", exact: true })
        .click();
      await page.reload();
      await page
        .getByRole("button", { name: "Review", exact: true })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("region", { name: "Quiz answer review" })
        .waitFor();
      const dashboard = await api("/learning/dashboard");
      assert.equal(dashboard.data.analytics.attempts, 1);
      assert.ok(
        dashboard.data.quizzes.some((q) => q.id === quizId && q.completed),
      );
      if (account.enabled)
        assert.equal((await api("/payments/account")).data.wallet.balance, 2);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close quiz", exact: true })
        .click();
    },
  );
  await check(
    "Mobile Journey navigation and horizontal containment",
    async () => {
      assert.ok(token, "Sign-in must succeed first");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/journey`);
      await page
        .getByRole("heading", { name: "Your AI Learning Journey" })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `${screenshots}/mobile-live-journey.png`,
        fullPage: true,
      });
      if (quizId) {
        await page
          .getByRole("button", { name: "Review", exact: true })
          .first()
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await page.screenshot({
          path: `${screenshots}/mobile-real-review.png`,
        });
        await dialog
          .getByRole("button", { name: "Close quiz", exact: true })
          .click();
      }
    },
  );
  await check(
    "PayPal sandbox checkout opens from the deployed Journey page",
    async () => {
      assert.ok(
        account?.enabled,
        "PayPal checkout is disabled on this deployment",
      );
      assert.equal(
        account.environment,
        "sandbox",
        "Live money checkout is excluded from automated QA",
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      const creating = page
        .waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/payments/orders",
          { timeout: 45000 },
        )
        .then(async (response) => ({
          status: response.status(),
          data: await response.json(),
        }));
      await page
        .getByRole("button", { name: "Buy with PayPal", exact: true })
        .first()
        .click();
      const { status, data } = await creating;
      assert.equal(
        status,
        200,
        `Checkout failed (${data.error?.code || "unknown"})`,
      );
      const order = data.purchase;
      assert.equal(
        new URL(order.approvalUrl).hostname,
        "www.sandbox.paypal.com",
      );
      // Only open the sandbox destination; buyer credentials and funds are never used here.
      await page.waitForURL(/https:\/\/www\.sandbox\.paypal\.com\//, {
        timeout: 30000,
      });
      const orderRecord = await db
        .collection("learningUsers")
        .doc(uid)
        .collection("purchases")
        .doc(order.id)
        .get();
      assert.equal(orderRecord.data().status, "CREATED");
      report.payments.checkoutOpened = true;
      report.limitations.push(
        "An unapproved sandbox order was created for this isolated test account; PayPal expires unapproved orders automatically.",
      );
    },
  );
  await check(
    "No uncaught browser exceptions during the live Journey workflow",
    async () => {
      assert.equal(
        runtimeErrors.length,
        0,
        `Observed ${runtimeErrors.length} browser exceptions`,
      );
    },
  );
} finally {
  if (browser) await browser.close();
  try {
    if (!uid) {
      try {
        uid = (await admin.getUserByEmail(email)).uid;
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
    }
    if (uid) {
      const user = await admin.getUser(uid);
      assert.equal(
        user.email,
        email,
        "Cleanup may only delete this run's temporary account",
      );
      await db.recursiveDelete(db.collection("learningUsers").doc(uid));
      await admin.deleteUser(uid);
    }
    report.cleanup = "passed";
  } catch {
    report.cleanup = "failed";
  }
  report.browserExceptionCount = runtimeErrors.length;
  report.apiFailures = apiFailures;
  report.ok =
    report.cleanup === "passed" &&
    report.checks.every((c) => c.status === "passed");
  await writeFile(
    "docs/journey-live-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.terminate();
  await deleteApp(firebase);
  console.info(
    `Live Journey verification: ${report.ok ? "PASSED" : "FAILED"}. See docs/journey-live-verification.json.`,
  );
  process.exitCode = report.ok ? 0 : 1;
}
