> PayPal AI Hackathon update: this app now includes AG Grid Community across the learning workspace and PayPal checkout for AI generation credits. See [current integration guide](docs/paypal-and-grid.md) for setup, architecture, verification and a demo flow. The original Qloo submission below is historical and needs adapting before submitting to the PayPal hackathon.

## Inspiration

Learning becomes more engaging when it connects to something we already care about. A learner who enjoys science fiction may be curious about astronomy, while someone interested in gaming may find an introduction to algorithms more approachable through familiar examples.

We wanted Learn By Quiz to make those connections useful. Instead of asking every learner to follow the same path, we set out to combine their cultural interests with educational subjects and demonstrated performance. Qloo gave us a way to discover relationships between real cultural entities, rather than asking a language model to invent those connections.

Our guiding principle is simple: interests should make learning inviting, while educational knowledge and performance should determine what a learner practices next.

## What it does

Learn By Quiz extends an existing quiz application with a personalized learning journey. Learners can select interests, search for favorites across movies, music, books, games, and other cultural categories, and save an editable taste profile. Qloo resolves those favorites into entity references and returns related cultural discoveries.

The learning agent uses that context alongside selected subjects and previous results to prepare a learning plan and personalized quizzes. Its implemented workflow supports five-question multiple-choice and true/false quizzes, explanations, difficulty levels, and a separate AI answer-review step before saving a quiz.

The dashboard brings together taste preferences, Qloo discoveries, saved learning plans, quizzes, and performance analytics. After a quiz, the server calculates accuracy and completion time, identifies weak topics, and recommends revision or a change in difficulty. Cultural preferences influence the examples; they do not change grades or override demonstrated performance.

Learners can also continue using the original timed quizzes powered by Open Trivia DB.

## How we built it

We upgraded the existing application instead of rebuilding it. The frontend retains React, Vite, Tailwind CSS, React Router, Zustand, and Framer Motion, with a new AI Learning Journey screen integrated into the existing navigation.

We added an Express backend and reused Firebase Authentication. The server verifies Firebase ID tokens and stores each learner's profiles, plans, quizzes, results, and execution traces in Firestore under their verified user ID.

Our dedicated Qloo service uses authenticated entity search and Insights requests. Search-derived entity IDs become the signals for cultural recommendations. The service validates and normalizes responses, caches successful results, and handles timeouts, unavailable results, authentication failures, and rate limits. Provider credentials remain on the server.

The learning workflow separates taste discovery, educational planning, quiz generation, answer review, and performance analysis. The configurable LLM adapter requests structured function calls, and schema validation rejects malformed questions, duplicate options, invalid answer indexes, and incorrect question formats. Actual execution steps, timings, and failures are recorded for transparency.

Quiz grading runs on the server. Firestore transactions ensure that concurrent or repeated submissions cannot create duplicate results or overwrite an already graded attempt.

## Challenges we ran into

One challenge was turning cultural recommendations into educational context without confusing the two. A relationship between movies or books can help make a lesson engaging, but it cannot establish whether a scientific answer is correct. We kept Qloo discoveries, AI educational content, and performance-based recommendations visibly distinct.

Live integration also revealed differences that mocked responses had missed. Qloo Search and Insights use different tag identifiers, some place records have null tags, and some artist metadata contains namespace placeholders without usable tag IDs. We adjusted normalization to handle those observed forms without inventing missing metadata. We also found a gaming entity-type discrepancy between the hackathon guide and the working API, and verified the correct request spelling through live calls.

Firebase setup required aligning the browser project, backend project, service account, quota configuration, and permissions. We resolved the access issues and then verified real sign-in, persistence, deployed data-access restrictions, and transaction behavior.

The initial LLM account reported exhausted API credit. We added a separate NVIDIA provider configuration, verified real structured function calling, and completed the live learning workflow. Live testing also exposed JSON-encoded nested containers and inconsistent output bounds; schema-directed decoding, strict validation and bounded repair now handle those cases.

## Accomplishments that we're proud of

We preserved the original application while adding a connected path from interests and cultural discovery to learning activities and performance-based next steps.

Qloo contributes real entity resolution and cross-category cultural recommendations. We verified all ten cultural categories exposed by the application through live Search and Insights requests, along with caching and invalid-credential handling.

We also verified Firebase Authentication and Firestore live, including profile creation and editing, user isolation, deployed browser-access restrictions, concurrent grading, and token revocation. Temporary verification accounts and records were removed after testing.

Our checks include 37 backend tests, two Firestore emulator and security-rule tests, four desktop/mobile browser workflows, and a successful production frontend build. A strict release-verification command distinguishes passed checks from blocked dependencies, making the remaining work explicit.

The complete live NVIDIA workflow now passes planning, both quiz formats at all three difficulty levels, independent answer review, grading, persistence, ownership boundaries and adaptive generation. The release report records the successful checks and test-account cleanup.

## What we learned

We learned that personalization works best when preferences and performance have clear responsibilities. Taste can help a learner connect with a subject, while results should guide revision and progression.

We learned to verify external APIs against real responses rather than relying only on examples. Response validation, careful normalization, and small live contract tests exposed issues before they became confusing failures in the interface.

We also learned that transparency is part of the product. Learners should understand why an activity is recommended, which information came from Qloo, and which content was generated by AI. A visible workflow is useful only when it reflects steps that actually executed.

Finally, passing local tests and proving live readiness are different milestones. Account permissions, provider credit, deployed security rules, and cleanup behavior all need their own verification.

## What's next for Learn By Quiz

Our immediate priority is to deploy the prepared single-server Docker package for learnbyquiz.spiritedrobot.in, verify the container and public HTTPS origin, and record a complete demonstration. Deployment awaits server access; the current public certificate does not match the hostname. Firebase domain authorization is configured, but public browser verification remains outstanding.

Next, we want to strengthen educational reliability with trusted reference material and source-backed explanations, alongside the existing schema checks and AI answer review. We also plan to improve topic-level revision recommendations and evaluate the learning experience with real learners before making claims about educational impact.

As usage grows, we plan to introduce durable background execution, shared rate limiting, and recovery for interrupted agent runs. We also want to add account-wide learning-data export and deletion controls.

Our longer-term goal is to help learners turn familiar interests into curiosity, practice, and a learning path they can understand and shape.
