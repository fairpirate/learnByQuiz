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
    if (path === "/api/learning/dashboard")
      return route.fulfill({
        json: {
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
  for (const name of ["Science fiction", "Technology", "Space exploration"])
    await page.getByLabel(name, { exact: true }).check();
  await page.getByLabel("Find a favorite in Qloo").fill("Interstellar");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Taste profile saved");
  await page.screenshot({
    path: `docs/screenshots/journey-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Generate personalized quiz" })
    .click();
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();
  await page.getByRole("button", { name: "Start quiz" }).click();
  for (let i = 0; i < 5; i++)
    await page.locator(`input[name=q${i}]`).first().check();
  await page.getByRole("button", { name: "Finish & analyze" }).click();
  await expect(page.getByText("100% correct · 30s")).toBeVisible();
  await expect(
    page.getByText("Continue based on strong astronomy performance."),
  ).toBeVisible();
  await expect(page.getByText("Educational explanation.")).toHaveCount(5);
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
  await page.route("https://opentdb.com/api.php**", (route) =>
    route.fulfill({
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
    }),
  );
  await signIn(page);
  await page.getByRole("button", { name: "Begin Test" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: /Correct/ }).click();
  await expect(
    page.getByRole("heading", { name: "100", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await expect(page.getByRole("button", { name: "Begin Test" })).toBeVisible();
});
