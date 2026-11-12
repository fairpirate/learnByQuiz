import { test, expect } from "@playwright/test";
const entity = {
  entity_id: "369d1544-628b-4c21-95a0-1488117a308a",
  name: "Interstellar",
  subtype: "urn:entity:movie",
  tags: [],
  affinity: null,
};
const quizId = "8b9617a4-1517-4b30-915f-4ab014b28bf9";
const questions = Array.from({ length: 5 }, (_, i) => ({
  question: `Astronomy question ${i + 1}?`,
  options: ["Answer A", "Answer B", "Answer C", "Answer D"],
  topic: "Astronomy",
  difficulty: "medium",
  type: "multiple",
}));
const quiz = {
  id: quizId,
  title: "Explore astronomy",
  subject: "Astronomy",
  difficulty: "medium",
  questions,
};
async function signIn(page) {
  const now = Math.floor(Date.now() / 1000);
  const token = [
    { alg: "none", typ: "JWT" },
    {
      iss: "https://securetoken.google.com/learnbyquiz-test",
      aud: "learnbyquiz-test",
      sub: "browser-user",
      user_id: "browser-user",
      email: "learner@example.com",
      iat: now,
      exp: now + 3600,
      auth_time: now,
      firebase: { sign_in_provider: "password" },
    },
    "",
  ]
    .map((x) =>
      typeof x === "string"
        ? x
        : Buffer.from(JSON.stringify(x)).toString("base64url"),
    )
    .join(".");
  await page.route(
    "https://identitytoolkit.googleapis.com/**",
    async (route) => {
      if (route.request().url().includes("accounts:lookup"))
        return route.fulfill({
          json: {
            users: [
              {
                localId: "browser-user",
                email: "learner@example.com",
                emailVerified: false,
                providerUserInfo: [
                  {
                    providerId: "password",
                    email: "learner@example.com",
                    rawId: "learner@example.com",
                  },
                ],
                lastLoginAt: String(Date.now()),
                createdAt: String(Date.now()),
              },
            ],
          },
        });
      await route.fulfill({
        json: {
          localId: "browser-user",
          email: "learner@example.com",
          idToken: token,
          refreshToken: "test-refresh",
          expiresIn: "3600",
          registered: true,
        },
      });
    },
  );
  await page.goto("/login");
  await page.locator("input[name=email]").fill("learner@example.com");
  await page.locator("input[name=password]").fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Welcome to")).toBeVisible();
}
function mockLearning(page) {
  let profile = null,
    generated = false,
    completed = false;
  const analytics = () => ({
    attempts: completed ? 1 : 0,
    accuracy: completed ? 100 : null,
    durationSeconds: completed ? 30 : 0,
    subjects: completed
      ? { Astronomy: { accuracy: 100, correct: 5, total: 5 } }
      : {},
    difficulties: {},
    weakSubjects: [],
    progress: [],
    nextDifficulty: completed ? "hard" : "medium",
  });
  return page.route("http://127.0.0.1:4173/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const performance = {
      accuracy: 100,
      durationSeconds: 30,
      items: questions.map((q) => ({
        ...q,
        correct: true,
        answer: 0,
        correctIndex: 0,
        explanation: "Educational explanation.",
      })),
    };
    const execution = {
      id: "test-run",
      status: "completed",
      steps: [
        {
          name: "Discover related culture with Qloo",
          status: "completed",
          durationMs: 20,
        },
      ],
    };
    if (path === "/api/payments/account")
      return route.fulfill({
        json: {
          enabled: false,
          environment: "sandbox",
          packs: [],
          wallet: null,
          purchases: [],
        },
      });
    if (path === "/api/learning/dashboard")
      return route.fulfill({
        json: {
          capabilities: { favoriteSearch: true, relatedDiscovery: true },
          profile,
          analytics: analytics(),
          recommendations: completed
            ? [
                {
                  topic: "Astronomy",
                  activity: "quiz",
                  difficulty: "hard",
                  explanation:
                    "Continue based on strong astronomy performance.",
                },
              ]
            : [],
          plans: [],
          executions: generated ? [execution] : [],
          quizzes: generated ? [{ ...quiz, completed }] : [],
        },
      });
    if (path === "/api/taste/discover")
      return route.fulfill({ json: { entities: [entity], source: "qloo" } });
    if (path === "/api/taste/profile") {
      if (route.request().method() === "DELETE") {
        profile = null;
        return route.fulfill({ status: 204 });
      }
      profile = route.request().postDataJSON();
      return route.fulfill({ json: { profile } });
    }
    if (path === "/api/taste/recommendations")
      return route.fulfill({
        json: {
          entities: [
            { ...entity, name: "Related cultural work", affinity: 0.8 },
          ],
          source: "qloo",
        },
      });
    if (path === "/api/agents/generate-quiz") {
      generated = true;
      return route.fulfill({
        json: { quiz, plan: { discoveries: [entity] }, execution },
      });
    }
    if (path === "/api/agents/executions")
      return route.fulfill({
        json: { executions: generated ? [execution] : [] },
      });
    if (path.endsWith("/start"))
      return route.fulfill({
        json: { quiz, performance: completed ? performance : null },
      });
    if (path === "/api/agents/analyze-performance") {
      completed = true;
      return route.fulfill({
        json: { performance, analytics: analytics(), recommendations: [] },
      });
    }
    await route.fulfill({
      status: 404,
      json: { error: { message: "Unexpected test endpoint" } },
    });
  });
}
test("taste profile, generated quiz, review and adaptive dashboard work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockLearning(page);
  await signIn(page);
  await page
    .getByRole("link", { name: "AI Learning Journey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your AI Learning Journey" }),
  ).toBeVisible();
  for (const name of ["Science fiction", "Technology", "Space exploration"]) {
    const checkbox = page.getByLabel(name, { exact: true });
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  }
  await page
    .getByLabel("Find a favorite", { exact: true })
    .fill("Interstellar");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Taste profile saved");
  await page.screenshot({
    path: `test-results/journey-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Generate personalized quiz" })
    .click();
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();
  await page.getByRole("button", { name: "Start quiz" }).click();
  const dialog = page.getByRole("dialog", { name: "Explore astronomy" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty("open", true);
  await dialog.locator('input[name="q0"]').first().click();
  await expect(dialog.locator('input[name="q0"]').first()).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeFocused();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await expect(dialog.locator('input[name="q0"]').first()).toBeChecked();
  for (let i = 0; i < 5; i++) {
    const answer = page.locator(`input[name=q${i}]`).first();
    await answer.click();
    await expect(answer).toBeChecked();
  }
  for (let i = 0; i < 5; i++)
    await expect(page.locator(`input[name=q${i}]`).first()).toBeChecked();
  await page.getByRole("button", { name: "Finish & analyze" }).click();
  await expect(page.getByText("100% correct · 30s")).toBeVisible();
  await expect(
    page.getByText("Continue based on strong astronomy performance."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Quiz answer review" })
      .getByText("Educational explanation.", { exact: true }),
  ).toHaveCount(5);
  await page.getByRole("button", { name: "Close quiz review" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Quiz answer review" }),
  ).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/quiz-popup-${test.info().project.name}.png`,
  });
  await dialog.getByRole("button", { name: "Close quiz", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("classic quizzes remain available and score against the real question count", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://opentdb.com/api.php**", async (route) => {
    requests++;
    await route.fulfill({
      json: {
        response_code: 0,
        results: Array.from({ length: 3 }, (_, i) => ({
          category: "Science",
          difficulty: "easy",
          question: `Classic question ${i + 1}?`,
          correct_answer: "Correct",
          incorrect_answers: ["Wrong A", "Wrong B", "Wrong C"],
        })),
      },
    });
  });
  await signIn(page);
  await page.getByRole("button", { name: "Begin Test" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  expect(requests).toBe(1);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: /Correct/ }).click();
  await expect(
    page.getByRole("heading", { name: "100", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await expect(page.getByRole("button", { name: "Begin Test" })).toBeVisible();
});

test("classic Start restarts completed and partial attempts, including persisted state", async ({
  page,
}) => {
  let requests = 0;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://opentdb.com/api.php**", (route) => {
    requests++;
    return route.fulfill({
      json: {
        response_code: 0,
        results: Array.from({ length: 3 }, (_, i) => ({
          category: "Science",
          difficulty: "easy",
          question: `Attempt ${requests}, question ${i + 1}?`,
          correct_answer: "Correct",
          incorrect_answers: ["Wrong A", "Wrong B", "Wrong C"],
        })),
      },
    });
  });
  await signIn(page);
  await page.getByRole("button", { name: "Begin Test" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Choose Correct", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "100", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Classic Quiz", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/question\/1$/);
  await expect(
    page.getByRole("heading", {
      name: "1. Attempt 1, question 1?",
      exact: true,
    }),
  ).toBeVisible();
  const initial = await page.evaluate(
    () => JSON.parse(localStorage.getItem("question-storage")).state,
  );
  expect(initial.page).toBe(1);
  expect(initial.userAnswer).toEqual([]);
  expect(initial.trueAnswer).toBe(0);
  expect(initial.falseAnswer).toBe(0);
  expect(initial.totalTime).toBeGreaterThan(Date.now());
  await page
    .getByRole("button", { name: "Choose Wrong A", exact: true })
    .click();
  await page.getByRole("link", { name: "Classic Quiz", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "1. Attempt 1, question 1?",
      exact: true,
    }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Choose Correct", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "100", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await page.getByRole("button", { name: "Begin Test" }).click();
  await page
    .getByRole("button", { name: "Start", exact: true })
    .click({ timeout: 12000 });
  await expect(
    page.getByRole("heading", {
      name: "1. Attempt 2, question 1?",
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toBe(2);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Choose Correct", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "100", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

const classicQuestions = [
  {
    category: "Science",
    difficulty: "easy",
    question: "What is H2O?",
    correct_answer: "Water",
    incorrect_answers: ["Salt", "Air", "Iron"],
  },
];

test("classic quiz waits and recovers from trivia rate limiting", async ({
  page,
}) => {
  const requestTimes = [];
  await page.route("https://opentdb.com/api.php**", async (route) => {
    requestTimes.push(Date.now());
    await route.fulfill(
      requestTimes.length === 1
        ? { status: 429, json: { response_code: 5 } }
        : { json: { response_code: 0, results: classicQuestions } },
    );
  });
  await signIn(page);
  await page.getByRole("button", { name: "Begin Test" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Trivia is busy. Retrying shortly…",
  );
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  expect(requestTimes).toHaveLength(2);
  expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(5000);
});

test("stale persisted errors clear and a provider outage can be retried", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://opentdb.com/api.php**", async (route) => {
    await route.fulfill(
      ++requests === 1
        ? { status: 503, body: "unavailable" }
        : { json: { response_code: 0, results: classicQuestions } },
    );
  });
  await signIn(page);
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("question-storage"));
    value.state.error = "Trivia service is unavailable. Please retry.";
    value.state.loading = true;
    localStorage.setItem("question-storage", JSON.stringify(value));
  });
  await page.reload();
  await page.getByRole("button", { name: "Begin Test" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  expect(requests).toBe(2);
  const persisted = await page.evaluate(
    () => JSON.parse(localStorage.getItem("question-storage")).state,
  );
  expect(persisted.error).toBeUndefined();
  expect(persisted.loading).toBeUndefined();
});

test("unavailable trivia settings allow choosing a different quiz", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://opentdb.com/api.php**", (route) =>
    route.fulfill({
      json:
        ++requests === 1
          ? { response_code: 1, results: [] }
          : { response_code: 0, results: classicQuestions },
    }),
  );
  await signIn(page);
  await page.getByRole("button", { name: "Begin Test" }).click();
  await expect(page.getByRole("alert")).toContainText("Not enough questions");
  await expect(
    page.getByRole("button", { name: "Change quiz settings" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Classic Quiz", exact: true }).click();
  await expect(page.getByRole("button", { name: "Begin Test" })).toBeVisible();
  await page.locator('select[name="type"]').selectOption("10");
  await page.getByRole("button", { name: "Begin Test" }).click();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  expect(requests).toBe(2);
});

test("PayPal pack checkout, return capture, payment recovery and filtering work", async ({
  page,
}) => {
  await mockLearning(page);
  const purchaseId = "c933ca2b-786f-4dd4-86c0-161ed6782898";
  let purchase = null,
    captured = false,
    captureCalls = 0;
  const pack = {
    id: "starter",
    name: "Learning starter",
    credits: 10,
    amount: "1.00",
    currency: "USD",
  };
  await page.route("http://127.0.0.1:4173/api/payments/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/account"))
      return route.fulfill({
        json: {
          enabled: true,
          environment: "sandbox",
          wallet: { balance: captured ? 13 : 3 },
          packs: [pack],
          purchases: purchase ? [purchase] : [],
        },
      });
    if (path.endsWith("/orders")) {
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(["id", "packId"]);
      expect(body.packId).toBe("starter");
      expect(body.id).toMatch(/^[a-f0-9-]{36}$/);
      purchase = {
        ...pack,
        id: purchaseId,
        packId: pack.id,
        orderId: "ORDER123",
        status: "CREATED",
        createdAt: new Date().toISOString(),
        approvalUrl:
          "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123",
      };
      return route.fulfill({ json: { purchase } });
    }
    if (path.endsWith(`/${purchaseId}/capture`)) {
      captureCalls++;
      captured = true;
      purchase.status = "COMPLETED";
      return route.fulfill({ json: { purchase } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route("https://www.sandbox.paypal.com/checkoutnow**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Sandbox buyer approval</h1>",
    }),
  );
  await signIn(page);
  await page
    .getByRole("link", { name: "AI Learning Journey", exact: true })
    .click();
  await expect(
    page.getByText("3 credits available", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buy with PayPal" }).click();
  await expect(
    page.getByRole("heading", { name: "Sandbox buyer approval" }),
  ).toBeVisible();
  await page.goto(`/journey?purchase=${purchaseId}&token=ORDER123`);
  await expect(
    page.getByText("Payment verified. Your learning credits are ready."),
  ).toBeVisible();
  await expect(
    page.getByText("13 credits available", { exact: false }),
  ).toBeVisible();
  expect(captureCalls).toBe(1);
  const history = page.getByRole("region", {
    name: "Payment history",
    exact: true,
  });
  await expect(history.getByText("COMPLETED", { exact: true })).toBeVisible();
  await history.getByRole("searchbox").fill("does-not-exist");
  await expect(
    history.getByText("No Matching Rows", { exact: true }).first(),
  ).toBeVisible();
  await history.getByRole("searchbox").fill("");
  await history.getByRole("button", { name: "Check payment" }).click();
  await expect(
    page.getByText("13 credits available", { exact: false }),
  ).toBeVisible();
  expect(captureCalls).toBe(2);
});

test("account errors explain how to recover without showing Firebase diagnostics", async ({
  page,
}) => {
  await page.route("https://identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: {
          code: 400,
          message: route.request().url().includes("accounts:signUp")
            ? "EMAIL_EXISTS"
            : "INVALID_LOGIN_CREDENTIALS",
        },
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("learner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Check your email address and password",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    /Firebase|auth\/|INVALID_LOGIN_CREDENTIALS/,
  );
  await page.getByRole("link", { name: "Sign Up", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Learner");
  await page.getByLabel("Email", { exact: true }).fill("learner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("safe-password");
  await page
    .getByLabel("Confirm Password", { exact: true })
    .fill("different-password");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your passwords don't match",
  );
  await page
    .getByLabel("Confirm Password", { exact: true })
    .fill("safe-password");
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "An account already uses this email address",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    /Firebase|auth\/|EMAIL_EXISTS/,
  );
});

test("Journey translates API, connection and saved activity errors into helpful messages", async ({
  page,
}) => {
  await mockLearning(page);
  let failure = "configured";
  await page.route(
    "http://127.0.0.1:4173/api/learning/dashboard",
    async (route) => {
      if (failure === "network") return route.abort("failed");
      if (failure === "html")
        return route.fulfill({
          status: 502,
          contentType: "text/html",
          body: "Nginx upstream stack trace at server.js",
        });
      if (failure === "trace")
        return route.fulfill({
          json: {
            profile: null,
            analytics: {
              attempts: 0,
              accuracy: null,
              subjects: {},
              difficulties: {},
              weakSubjects: [],
              progress: [],
            },
            recommendations: [],
            quizzes: [],
            plans: [],
            executions: [
              {
                status: "failed",
                error: "Configure NVIDIA_API_KEY. Firebase permission denied",
                errorCode: "LLM_NOT_CONFIGURED",
                steps: [
                  {
                    name: "Create quiz",
                    status: "failed",
                    error: "Raw schema validation at private.js",
                  },
                ],
              },
            ],
          },
        });
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "LLM_NOT_CONFIGURED",
            message: "Configure NVIDIA_API_KEY. Firebase permission denied",
            requestId: "test-request",
          },
        },
      });
    },
  );
  await signIn(page);
  await page
    .getByRole("link", { name: "AI Learning Journey", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "AI learning isn't available yet",
  );
  failure = "network";
  await page.getByRole("button", { name: "Retry dashboard" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Check your internet connection",
  );
  failure = "html";
  await page.getByRole("button", { name: "Retry dashboard" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  failure = "trace";
  await page.getByRole("button", { name: "Retry dashboard" }).click();
  await expect(
    page.getByRole("region", { name: "Agent execution steps" }),
  ).toBeVisible();
  await expect(
    page.getByText("AI learning isn't available yet.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /NVIDIA_API_KEY|schema validation|permission denied|private\.js|server\.js|Firebase/,
  );
});
