# Quiz 2 Learn — Hackathon Submission

---

## Inspiration

Learning becomes more engaging when it connects to something we already care about. A learner who enjoys science fiction may be curious about astronomy, while someone interested in gaming may find an introduction to algorithms more approachable through familiar examples.

We wanted Quiz 2 Learn to make those connections useful. Instead of asking every learner to follow the same path, we set out to combine their cultural interests with educational subjects and demonstrated performance, turning personal interests into engaging learning opportunities.

**Our guiding principle:** interests should make learning inviting, while educational knowledge and performance should determine what a learner practices next.

---

## What it does

Quiz 2 Learn extends an existing quiz application with a personalized learning journey.

- **Personalized taste profiles** — Learners select interests, search for favorites across movies, music, books, games, and other cultural categories, and save an editable taste profile.
- **Cultural discovery** — Learners' selected interests are transformed into learning context, and the system prepares personalized quizzes (five-question multiple-choice and true/false formats, explanations, difficulty levels, and a separate AI answer-review step before saving).
- **Dashboard & analytics** — Brings together taste preferences, saved learning plans, quizzes, and performance analytics. After a quiz, the server calculates accuracy and completion time, identifies weak topics, and recommends revision or a change in difficulty.
- **Open Trivia DB quizzes** — Learners can continue using the original timed quizzes powered by Open Trivia DB.

*Cultural preferences influence the examples; they do not change grades or override demonstrated performance.*

---

## How we built it

**Frontend** — Upgraded the existing application instead of rebuilding it. The frontend retains React, Vite, Tailwind CSS, React Router, Zustand, and Framer Motion, with a new AI Learning Journey screen integrated into the existing navigation.

**Backend & Auth** — Added an Express backend and reused Firebase Authentication. The server verifies Firebase ID tokens and stores each learner's profiles, plans, quizzes, results, and execution traces in Firestore under their verified user ID.

**Learning workflow** — Separates taste discovery, educational planning, quiz generation, answer review, and performance analysis. The configurable LLM adapter requests structured function calls, and schema validation rejects malformed questions, duplicate options, invalid answer indexes, and incorrect question formats. Actual execution steps, timings, and failures are recorded for transparency.

**Quiz grading** — Runs on the server. Firestore transactions ensure that concurrent or repeated submissions cannot create duplicate results or overwrite an already graded attempt.

---

## Challenges we ran into

**Separating cultural recommendations from educational content.** A relationship between movies or books can help make a lesson engaging, but it cannot establish whether a scientific answer is correct. We kept cultural discoveries, AI educational content, and performance-based recommendations visibly distinct.

**Live API integration differences.** Mocked responses missed real-world quirks: different tag identifiers, some records have null tags, and some artist metadata contains namespace placeholders without usable tag IDs. We adjusted normalization to handle those observed forms without inventing missing metadata. We also found a gaming entity-type discrepancy between the hackathon guide and the working API, and verified the correct request spelling through live calls.

**Firebase setup.** Required aligning the browser project, backend project, service account, quota configuration, and permissions. We resolved the access issues and then verified real sign-in, persistence, deployed data-access restrictions, and transaction behavior.

**LLM provider credit exhaustion.** The initial LLM account reported exhausted API credit. We added a separate NVIDIA provider configuration, verified real structured function calling, and completed the live learning workflow. Live testing exposed JSON-encoded nested containers and inconsistent output bounds; schema-directed decoding, strict validation, and bounded repair now handle those cases.

---

## Accomplishments that we're proud of

- **Preserved the original application** while adding a connected path from interests and cultural discovery to learning activities and performance-based next steps.
- **Cultural integration verified live** — All cultural categories exposed by the application pass live discovery requests, along with caching and credential handling.
- **Firebase Authentication & Firestore verified live** — Including profile creation and editing, user isolation, deployed browser-access restrictions, concurrent grading, and token revocation. Temporary verification accounts and records were removed after testing.
- **Comprehensive test coverage** — 37 backend tests, two Firestore emulator and security-rule tests, four desktop/mobile browser workflows, and a successful production frontend build. A strict release-verification command distinguishes passed checks from blocked dependencies.
- **Complete live NVIDIA workflow** — Passes planning, both quiz formats at all three difficulty levels, independent answer review, grading, persistence, ownership boundaries, and adaptive generation.

---

## What we learned

- **Personalization works best with clear responsibilities.** Taste can help a learner connect with a subject, while results should guide revision and progression.
- **Verify external APIs against real responses**, not just examples. Response validation, careful normalization, and small live contract tests exposed issues before they became confusing failures in the interface.
- **Transparency is part of the product.** Learners should understand why an activity is recommended, which content was generated by AI, and how personal interests guide learning. A visible workflow is useful only when it reflects steps that actually executed.
- **Local tests and live readiness are different milestones.** Account permissions, provider credit, deployed security rules, and cleanup behavior all need their own verification.

---

## What's next for Quiz 2 Learn

**Immediate priority:** Deploy the prepared single-server Docker package for learnbyquiz.spiritedrobot.in, verify the container and public HTTPS origin, and record a complete demonstration. Deployment awaits server access; the current public certificate does not match the hostname. Firebase domain authorization is configured, but public browser verification remains outstanding.

**Educational reliability:** Strengthen with trusted reference material and source-backed explanations alongside existing schema checks and AI answer review. Improve topic-level revision recommendations and evaluate the learning experience with real learners before making claims about educational impact.

**Scalability:** Introduce durable background execution, shared rate limiting, and recovery for interrupted agent runs. Add account-wide learning-data export and deletion controls.

**Longer-term goal:** Help learners turn familiar interests into curiosity, practice, and a learning path they can understand and shape.
