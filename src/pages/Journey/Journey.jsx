import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { learningApi } from "../../api/learning";
import DataGrid from "../../components/Grid/DataGrid";
import QuizGrid from "../../components/Grid/QuizGrid";
import PreferenceGrid from "../../components/Grid/PreferenceGrid";
import Payments from "../../components/Grid/Payments";
const categories = [
  ["movie", "Movies"],
  ["tv_show", "Television"],
  ["artist", "Music"],
  ["book", "Books"],
  ["videogame", "Gaming"],
  ["destination", "Travel"],
  ["place", "Food & places"],
  ["brand", "Brands & technology"],
  ["person", "People, sports & art"],
  ["podcast", "Podcasts"],
];
const interestOptions = [
  "Science fiction",
  "Space exploration",
  "Technology",
  "Gaming",
  "Music",
  "Books",
  "Travel",
  "Food",
  "Sports",
  "Art and culture",
];
const subjects = [
  "Astronomy",
  "Physics",
  "Computer science",
  "Mathematics",
  "Biology",
  "History",
  "Geography",
  "Literature",
  "Art",
];
function profilePayload(profile) {
  return {
    interests: profile.interests,
    subjects: profile.subjects,
    // The server re-fetches canonical metadata; send references rather than up to 1,500 tags.
    entities: profile.entities.map(({ entity_id, name, subtype }) => ({
      entity_id,
      name,
      subtype,
    })),
  };
}
export default function Journey() {
  const [dashboard, setDashboard] = useState(null),
    [profile, setProfile] = useState({
      interests: [],
      subjects: ["Astronomy"],
      entities: [],
    });
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("movie"),
    [results, setResults] = useState([]),
    [discoveries, setDiscoveries] = useState([]);
  const [targetType, setTargetType] = useState("book"),
    [difficulty, setDifficulty] = useState("medium"),
    [format, setFormat] = useState("multiple");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [executions, setExecutions] = useState([]),
    [quiz, setQuiz] = useState(null),
    [answers, setAnswers] = useState([]),
    [performance, setPerformance] = useState(null);
  const mounted = useRef(true),
    running = useRef(false);
  async function refresh(hydrate = false) {
    const data = await learningApi("/learning/dashboard");
    if (!mounted.current) return;
    setDashboard(data);
    setExecutions(data.executions);
    if (hydrate && data.profile) setProfile(data.profile);
  }
  useEffect(() => {
    mounted.current = true;
    refresh(true).catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!busy.startsWith("agent")) return;
    const controller = new AbortController();
    const timer = setInterval(
      () =>
        learningApi("/agents/executions", { signal: controller.signal })
          .then((d) => {
            if (mounted.current) setExecutions(d.executions);
          })
          .catch(() => {}),
      1500,
    );
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [busy]);
  async function act(label, fn) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) setError(e.message);
      if (label.startsWith("agent")) {
        // Fetch the final failed trace even when the last polling tick preceded failure.
        try {
          await refresh();
        } catch {
          /* Preserve the original actionable failure. */
        }
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy("");
    }
  }
  function toggle(field, value) {
    setProfile((p) => ({
      ...p,
      [field]: p[field].includes(value)
        ? p[field].filter((x) => x !== value)
        : [...p[field], value],
    }));
  }
  async function generate(planOnly = false) {
    await act(planOnly ? "agent-plan" : "agent-quiz", async () => {
      // Save explicit edits before using the agent; server validation is authoritative.
      await learningApi("/taste/profile", {
        method: "PUT",
        body: profilePayload(profile),
      });
      const data = await learningApi(
        `/agents/${planOnly ? "learning-plan" : "generate-quiz"}`,
        { method: "POST", body: { difficulty, format, targetType } },
      );
      setNotice(
        planOnly
          ? "Your learning plan is saved."
          : "Your quiz is saved. Select Start quiz below when you are ready.",
      );
      setDiscoveries(data.plan.discoveries);
      await refresh();
    });
  }
  async function start(id) {
    await act("start", async () => {
      const data = await learningApi(`/learning/quizzes/${id}/start`, {
        method: "POST",
      });
      setQuiz(data.quiz);
      setAnswers([]);
      setPerformance(data.performance);
    });
  }
  return (
    <div className="journey">
      <header className="journey-hero">
        <div>
          <p className="eyebrow">Qloo × LearnByQuiz</p>
          <h1>Your AI Learning Journey</h1>
          <p>Turn the things you love into something you understand.</p>
        </div>
        <Link to="/">Classic quiz →</Link>
      </header>
      <p className="journey-privacy">
        Your interests provide context. Your learning performance guides
        difficulty. No sensitive identity predictions.
      </p>
      {error && (
        <div role="alert" className="journey-error">
          {error}
          <button
            type="button"
            onClick={() => act("refresh", () => refresh(true))}
            disabled={!!busy}
          >
            Retry dashboard
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="journey-notice">
          {notice}
        </p>
      )}
      {!dashboard && !error && (
        <p role="status">Loading your learning journey…</p>
      )}
      <div className="journey-grid">
        <section className="journey-card">
          <p className="eyebrow">01 · Discover my interests</p>
          <h2>My Taste Profile</h2>
          <fieldset disabled={!!busy}>
            <legend>What do you enjoy?</legend>
            <PreferenceGrid
              label="Interests"
              options={interestOptions}
              selected={profile.interests}
              disabled={!!busy}
              onToggle={(name) => toggle("interests", name)}
            />
          </fieldset>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act("search", async () => {
                const d = await learningApi("/taste/discover", {
                  method: "POST",
                  body: { query, type: category },
                });
                setResults(d.entities);
                if (!d.entities.length)
                  setNotice(
                    "No Qloo matches. Try a specific movie, artist, book, game, or brand.",
                  );
              });
            }}
          >
            <label htmlFor="taste-category">Search category</label>
            <select
              id="taste-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <label htmlFor="taste-query">Find a favorite in Qloo</label>
            <div className="journey-search">
              <input
                id="taste-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try Interstellar or a favorite book"
                maxLength={500}
                required
              />
              <button disabled={!!busy}>
                {busy === "search" ? "Searching…" : "Search"}
              </button>
            </div>
          </form>
          <p className="journey-muted">
            Broad interests such as space exploration guide the AI. Select at
            least one real Qloo entity below to supply cultural intelligence.
          </p>
          <DataGrid
            label="Qloo search results"
            rows={results}
            columns={[
              { field: "name", headerName: "Favorite", minWidth: 180 },
              {
                headerName: "Category",
                valueGetter: (p) => p.data.subtype.replace("urn:entity:", ""),
              },
              {
                headerName: "Select",
                sortable: false,
                filter: false,
                cellRenderer: ({ data: e }) => (
                  <button
                    disabled={
                      !!busy ||
                      profile.entities.some(
                        (x) => x.entity_id === e.entity_id,
                      ) ||
                      profile.entities.length >= 15
                    }
                    onClick={() =>
                      setProfile((p) => ({
                        ...p,
                        entities: [...p.entities, e],
                      }))
                    }
                  >
                    Add
                  </button>
                ),
              },
            ]}
          />
          <DataGrid
            label="Selected Qloo entities"
            rows={profile.entities}
            searchable={false}
            exportable={false}
            columns={[
              { field: "name", headerName: "Selected favorite", minWidth: 180 },
              {
                headerName: "Action",
                filter: false,
                sortable: false,
                cellRenderer: ({ data: e }) => (
                  <button
                    aria-label={`Remove ${e.name}`}
                    disabled={!!busy}
                    onClick={() =>
                      setProfile((p) => ({
                        ...p,
                        entities: p.entities.filter(
                          (x) => x.entity_id !== e.entity_id,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                ),
              },
            ]}
          />
          <fieldset disabled={!!busy}>
            <legend>What would you like to learn?</legend>
            <PreferenceGrid
              label="Learning subjects"
              options={subjects}
              selected={profile.subjects}
              disabled={!!busy}
              onToggle={(name) => toggle("subjects", name)}
            />
          </fieldset>
          <div className="journey-actions">
            <button
              disabled={
                !!busy || !profile.entities.length || !profile.subjects.length
              }
              onClick={() =>
                act("save", async () => {
                  await learningApi("/taste/profile", {
                    method: "PUT",
                    body: profilePayload(profile),
                  });
                  setNotice("Taste profile saved.");
                  await refresh();
                })
              }
            >
              Save preferences
            </button>
            <button
              className="secondary"
              disabled={!!busy || !dashboard?.profile}
              onClick={() =>
                act("delete", async () => {
                  await learningApi("/taste/profile", { method: "DELETE" });
                  setProfile({
                    interests: [],
                    subjects: ["Astronomy"],
                    entities: [],
                  });
                  setDiscoveries([]);
                  setNotice(
                    "Taste profile deleted. Saved learning activities remain in your history.",
                  );
                  await refresh();
                })
              }
            >
              Delete profile
            </button>
          </div>
        </section>
        <div className="journey-stack">
          <section className="journey-card">
            <p className="eyebrow">02 · AI learning agent</p>
            <h2>Taste-Based Learning</h2>
            <p>
              Create an educational plan, then a quiz with explanations and an
              independent AI answer review.
            </p>
            <div className="journey-controls">
              <label>
                Starting difficulty
                <select
                  value={difficulty}
                  disabled={!!busy}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Intermediate</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                Question format
                <select
                  value={format}
                  disabled={!!busy}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="multiple">Multiple choice</option>
                  <option value="boolean">True / false</option>
                </select>
              </label>
              <label>
                Discover related culture
                <select
                  value={targetType}
                  disabled={!!busy}
                  onChange={(e) => setTargetType(e.target.value)}
                >
                  {categories.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="journey-muted">
              After your first quiz, demonstrated performance sets difficulty
              automatically.
            </p>
            <div className="journey-actions">
              <button
                disabled={
                  !!busy || !profile.entities.length || !profile.subjects.length
                }
                onClick={() => generate(false)}
              >
                {busy === "agent-quiz"
                  ? "Preparing quiz…"
                  : "Generate personalized quiz"}
              </button>
              <button
                className="secondary"
                disabled={
                  !!busy || !profile.entities.length || !profile.subjects.length
                }
                onClick={() => generate(true)}
              >
                Create learning plan
              </button>
            </div>
            {executions[0] && (
              <div className="journey-trace" aria-live="polite">
                <h3>Latest agent execution · {executions[0].status}</h3>
                <DataGrid
                  label="Agent execution steps"
                  rows={executions[0].steps}
                  searchable={false}
                  columns={[
                    { field: "name", headerName: "Step", minWidth: 200 },
                    { field: "status", headerName: "Status" },
                    {
                      headerName: "Duration",
                      valueGetter: (p) =>
                        p.data.durationMs != null
                          ? `${(p.data.durationMs / 1000).toFixed(1)}s`
                          : "Running",
                    },
                    { field: "error", headerName: "Details", minWidth: 170 },
                  ]}
                />
                {executions[0].error && <p>{executions[0].error}</p>}
              </div>
            )}
          </section>
          <section className="journey-card">
            <p className="eyebrow">Cultural intelligence · Qloo</p>
            <h2>Qloo-powered discoveries</h2>
            <button
              className="secondary"
              disabled={!!busy || !dashboard?.profile}
              onClick={() =>
                act("discover", async () => {
                  const d = await learningApi(
                    `/taste/recommendations?type=${targetType}`,
                  );
                  setDiscoveries(d.entities);
                })
              }
            >
              Discover related interests
            </button>
            {!discoveries.length && (
              <p className="journey-muted">
                Save your favorites, then discover real relationships from Qloo.
              </p>
            )}
            <DataGrid
              label="Qloo discoveries"
              rows={discoveries}
              columns={[
                { field: "name", headerName: "Discovery", minWidth: 180 },
                {
                  headerName: "Category",
                  valueGetter: (p) => p.data.subtype.replace("urn:entity:", ""),
                },
                {
                  headerName: "Tags",
                  valueGetter: (p) =>
                    p.data.tags
                      .slice(0, 4)
                      .map((t) => t.name)
                      .join(" · "),
                  minWidth: 180,
                },
                {
                  field: "affinity",
                  headerName: "Affinity",
                  valueFormatter: (p) =>
                    p.value == null ? "—" : p.value.toFixed(3),
                },
              ]}
            />
            {!!discoveries.length && (
              <p className="journey-muted">
                Ranked by Qloo using the entity references in your saved
                profile. These cultural relationships inform AI examples; they
                do not validate educational facts.
              </p>
            )}
          </section>
        </div>
      </div>
      <Payments revision={busy} />
      {quiz && (
        <section className="journey-card journey-active">
          <p className="eyebrow">AI-generated educational content</p>
          <h2>{quiz.title}</h2>
          <p>
            {quiz.subject} · {quiz.difficulty} · 5 questions
          </p>
          {!performance ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  quiz.questions.some(
                    (q, i) =>
                      !Number.isInteger(answers[i]) ||
                      answers[i] < 0 ||
                      answers[i] >= q.options.length,
                  )
                ) {
                  setError("Answer every question before submitting.");
                  return;
                }
                act("submit", async () => {
                  const d = await learningApi("/agents/analyze-performance", {
                    method: "POST",
                    body: { quizId: quiz.id, answers },
                  });
                  setPerformance(d.performance);
                  await refresh();
                });
              }}
            >
              <QuizGrid
                questions={quiz.questions}
                answers={answers}
                disabled={!!busy}
                onAnswer={(i, j) =>
                  setAnswers((a) => {
                    const copy = [...a];
                    copy[i] = j;
                    return copy;
                  })
                }
              />
              <button
                disabled={
                  !!busy ||
                  answers.filter((a) => Number.isInteger(a)).length !== 5
                }
              >
                Finish & analyze
              </button>
            </form>
          ) : (
            <div>
              <h3>
                {performance.accuracy}% correct · {performance.durationSeconds}s
              </h3>
              <QuizGrid
                questions={quiz.questions}
                answers={answers}
                performance={performance}
              />
              <button
                className="secondary"
                onClick={() => {
                  setQuiz(null);
                  setPerformance(null);
                }}
              >
                Close quiz review
              </button>
            </div>
          )}
        </section>
      )}
      <div className="journey-grid">
        <section className="journey-card">
          <p className="eyebrow">03 · Learn and adapt</p>
          <h2>Learning Analytics</h2>
          <div className="journey-stats">
            <div>
              <strong>{dashboard?.analytics.attempts || 0}</strong>
              <span>Quizzes completed</span>
            </div>
            <div>
              <strong>
                {dashboard?.analytics.accuracy == null
                  ? "—"
                  : `${dashboard.analytics.accuracy}%`}
              </strong>
              <span>Accuracy</span>
            </div>
            <div>
              <strong>{dashboard?.analytics.durationSeconds || 0}s</strong>
              <span>Learning time</span>
            </div>
          </div>
          {!dashboard?.analytics.attempts && (
            <p>
              Complete your first personalized quiz to see progress and
              suggested next activities.
            </p>
          )}
          <h3>Subject performance</h3>
          <DataGrid
            label="Subject performance"
            rows={Object.entries(dashboard?.analytics.subjects || {}).map(
              ([topic, stats]) => ({ topic, ...stats }),
            )}
            columns={[
              { field: "topic", headerName: "Subject", minWidth: 160 },
              { field: "accuracy", headerName: "Accuracy %" },
              { field: "correct", headerName: "Correct" },
              { field: "total", headerName: "Questions" },
            ]}
          />
          <h3>Difficulty performance</h3>
          <DataGrid
            label="Difficulty performance"
            rows={Object.entries(dashboard?.analytics.difficulties || {}).map(
              ([level, stats]) => ({ level, ...stats }),
            )}
            columns={[
              { field: "level", headerName: "Difficulty" },
              { field: "accuracy", headerName: "Accuracy %" },
              { field: "total", headerName: "Questions" },
            ]}
          />
          <h3>Weak subjects</h3>
          <p>
            {dashboard?.analytics.weakSubjects.map((s) => s.topic).join(", ") ||
              "No revision areas identified yet."}
          </p>
          <h3>Recent progress</h3>
          <DataGrid
            label="Recent progress"
            rows={dashboard?.analytics.progress || []}
            columns={[
              { field: "subject", headerName: "Subject" },
              { field: "accuracy", headerName: "Accuracy %" },
              {
                field: "at",
                headerName: "Date",
                minWidth: 160,
                valueFormatter: (p) => new Date(p.value).toLocaleString(),
              },
            ]}
          />
        </section>
        <section className="journey-card">
          <p className="eyebrow">Your next step</p>
          <h2>Personalized Recommendations</h2>
          <DataGrid
            label="Personalized recommendations"
            rows={dashboard?.recommendations || []}
            columns={[
              { field: "topic", headerName: "Topic", minWidth: 150 },
              { field: "activity", headerName: "Activity" },
              { field: "difficulty", headerName: "Difficulty" },
              {
                field: "explanation",
                headerName: "Why this activity",
                minWidth: 260,
              },
            ]}
          />
          <h3>Saved learning plans · AI-generated</h3>
          {!dashboard?.plans.length && (
            <p className="journey-muted">Your plans will appear here.</p>
          )}
          <DataGrid
            label="Saved learning plans"
            rows={dashboard?.plans || []}
            columns={[
              { field: "title", headerName: "Plan", minWidth: 160 },
              {
                field: "explanation",
                headerName: "Learning context",
                minWidth: 240,
              },
              {
                headerName: "Concepts",
                valueGetter: (p) => p.data.concepts.join(" · "),
                minWidth: 180,
              },
            ]}
          />
        </section>
      </div>
      <section className="journey-card">
        <p className="eyebrow">Your library</p>
        <h2>Recently generated quizzes</h2>
        {!dashboard?.quizzes.length && (
          <p>
            Your saved personalized quizzes will appear here. Generate a new
            quiz to explore another set of questions.
          </p>
        )}
        <DataGrid
          label="Quiz library"
          rows={dashboard?.quizzes || []}
          columns={[
            { field: "title", headerName: "Quiz", minWidth: 200 },
            { field: "subject", headerName: "Subject" },
            { field: "difficulty", headerName: "Difficulty" },
            {
              headerName: "Status",
              valueGetter: (p) =>
                p.data.completed ? "Completed" : "Ready to learn",
            },
            {
              headerName: "Action",
              filter: false,
              sortable: false,
              cellRenderer: ({ data: q }) => (
                <button disabled={!!busy} onClick={() => start(q.id)}>
                  {q.completed ? "Review" : "Start quiz"}
                </button>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
