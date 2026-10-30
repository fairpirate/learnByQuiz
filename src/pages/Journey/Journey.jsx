import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { learningApi } from "../../api/learning";
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
            <div className="journey-chips">
              {interestOptions.map((x) => (
                <label
                  key={x}
                  className={profile.interests.includes(x) ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={profile.interests.includes(x)}
                    onChange={() => toggle("interests", x)}
                  />
                  {x}
                </label>
              ))}
            </div>
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
          <ul className="journey-results">
            {results.map((e) => (
              <li key={e.entity_id}>
                <span>
                  <strong>{e.name}</strong>
                  <small>{e.subtype.replace("urn:entity:", "")}</small>
                </span>
                <button
                  disabled={
                    !!busy ||
                    profile.entities.some((x) => x.entity_id === e.entity_id) ||
                    profile.entities.length >= 15
                  }
                  onClick={() =>
                    setProfile((p) => ({ ...p, entities: [...p.entities, e] }))
                  }
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
          <div className="journey-chips" aria-label="Selected Qloo entities">
            {profile.entities.map((e) => (
              <button
                key={e.entity_id}
                disabled={!!busy}
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    entities: p.entities.filter(
                      (x) => x.entity_id !== e.entity_id,
                    ),
                  }))
                }
                aria-label={`Remove ${e.name}`}
              >
                {e.name} ×
              </button>
            ))}
          </div>
          <fieldset disabled={!!busy}>
            <legend>What would you like to learn?</legend>
            <div className="journey-chips">
              {subjects.map((x) => (
                <label
                  key={x}
                  className={profile.subjects.includes(x) ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={profile.subjects.includes(x)}
                    onChange={() => toggle("subjects", x)}
                  />
                  {x}
                </label>
              ))}
            </div>
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
                <ol>
                  {executions[0].steps.map((s, i) => (
                    <li key={i}>
                      <span>
                        {s.status === "completed"
                          ? "✓"
                          : s.status === "failed"
                            ? "×"
                            : "…"}{" "}
                        {s.name}
                      </span>
                      <small>
                        {s.durationMs != null
                          ? `${(s.durationMs / 1000).toFixed(1)}s`
                          : s.status}
                      </small>
                      {s.error && <p>{s.error}</p>}
                    </li>
                  ))}
                </ol>
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
            <ul className="journey-discoveries">
              {discoveries.map((e) => (
                <li key={e.entity_id}>
                  <strong>{e.name}</strong>
                  <p>
                    {e.tags
                      .slice(0, 4)
                      .map((t) => t.name)
                      .join(" · ")}
                  </p>
                  <small>
                    Qloo · {e.subtype.replace("urn:entity:", "")}
                    {e.affinity !== null
                      ? ` · affinity ${e.affinity.toFixed(3)}`
                      : ""}
                  </small>
                </li>
              ))}
            </ul>
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
              {quiz.questions.map((q, i) => (
                <fieldset key={i} disabled={!!busy}>
                  <legend>
                    {i + 1}. {q.question}
                  </legend>
                  {q.options.map((option, j) => (
                    <label className="journey-option" key={j}>
                      <input
                        required
                        type="radio"
                        name={`q${i}`}
                        checked={answers[i] === j}
                        onChange={() =>
                          setAnswers((a) => {
                            const copy = [...a];
                            copy[i] = j;
                            return copy;
                          })
                        }
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
              ))}
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
              {performance.items.map((item, i) => (
                <div className="journey-review" key={i}>
                  <h4>
                    {item.correct ? "✓" : "×"} {item.question}
                  </h4>
                  <p>Your answer: {quiz.questions[i].options[item.answer]}</p>
                  <p>
                    Correct answer:{" "}
                    {quiz.questions[i].options[item.correctIndex]}
                  </p>
                  <p>{item.explanation}</p>
                </div>
              ))}
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
          {Object.entries(dashboard?.analytics.subjects || {}).map(
            ([topic, s]) => (
              <div className="journey-progress" key={topic}>
                <label htmlFor={`progress-${topic}`}>
                  {topic} · {s.accuracy}% ({s.correct}/{s.total})
                </label>
                <progress
                  id={`progress-${topic}`}
                  max="100"
                  value={s.accuracy}
                />
              </div>
            ),
          )}
          <h3>Difficulty performance</h3>
          {Object.entries(dashboard?.analytics.difficulties || {}).map(
            ([level, s]) => (
              <p key={level}>
                {level}: {s.accuracy}% · {s.total} questions
              </p>
            ),
          )}
          <h3>Weak subjects</h3>
          <p>
            {dashboard?.analytics.weakSubjects.map((s) => s.topic).join(", ") ||
              "No revision areas identified yet."}
          </p>
          <h3>Recent progress</h3>
          <div className="journey-progress-list">
            {dashboard?.analytics.progress.map((p, i) => (
              <p key={i}>
                {p.subject}: {p.accuracy}%{" "}
                <small>{new Date(p.at).toLocaleDateString()}</small>
              </p>
            ))}
          </div>
        </section>
        <section className="journey-card">
          <p className="eyebrow">Your next step</p>
          <h2>Personalized Recommendations</h2>
          {dashboard?.recommendations.map((r, i) => (
            <article className="journey-review" key={i}>
              <h3>
                {r.activity === "revision" ? "Revise" : "Explore"} {r.topic}
              </h3>
              <p>{r.explanation}</p>
              <small>Performance engine · {r.difficulty}</small>
            </article>
          ))}
          <h3>Saved learning plans · AI-generated</h3>
          {!dashboard?.plans.length && (
            <p className="journey-muted">Your plans will appear here.</p>
          )}
          {dashboard?.plans.slice(0, 3).map((p) => (
            <article className="journey-review" key={p.id}>
              <h4>{p.title}</h4>
              <p>{p.explanation}</p>
              <small>{p.concepts.join(" · ")}</small>
            </article>
          ))}
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
        <ul className="journey-results">
          {dashboard?.quizzes.map((q) => (
            <li key={q.id}>
              <span>
                <strong>{q.title}</strong>
                <small>
                  {q.subject} · {q.difficulty} ·{" "}
                  {q.completed ? "Completed" : "Ready to learn"}
                </small>
              </span>
              <button disabled={!!busy} onClick={() => start(q.id)}>
                {q.completed ? "Review" : "Start quiz"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
