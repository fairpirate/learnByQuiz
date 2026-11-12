import test from "node:test";
import assert from "node:assert/strict";
import { createTriviaClient } from "../../src/api/trivia.js";

const question = {
  category: "Science",
  difficulty: "easy",
  question: "What is H2O?",
  correct_answer: "Water",
  incorrect_answers: ["Salt", "Air", "Iron"],
};
const success = () => Response.json({ response_code: 0, results: [question] });
function setup(fetchImpl) {
  let time = 1000;
  const waits = [];
  const load = createTriviaClient({
    fetchImpl,
    now: () => time,
    wait: async (ms) => {
      waits.push(ms);
      time += ms;
    },
  });
  return { load, waits };
}

test("trivia deduplicates simultaneous loads and spaces different quizzes", async () => {
  let calls = 0;
  const { load, waits } = setup(async () => {
    calls++;
    return success();
  });
  const first = load("?amount=5&category=9");
  const duplicate = load("?category=9&amount=5");
  assert.equal(first, duplicate);
  await Promise.all([first, duplicate, load("?amount=5&category=10")]);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [5200]);
});

test("HTTP 429 and provider code 5 get one cooldown retry", async () => {
  for (const limited of [
    () =>
      Response.json(
        { response_code: 5 },
        { status: 429, headers: { "Retry-After": "8" } },
      ),
    () => Response.json({ response_code: 5 }),
  ]) {
    let calls = 0,
      notices = 0;
    const { load, waits } = setup(async () =>
      ++calls === 1 ? limited() : success(),
    );
    assert.deepEqual(await load("?amount=5", { onWait: () => notices++ }), [
      question,
    ]);
    assert.equal(calls, 2);
    assert.equal(notices, 1);
    assert.ok(waits[0] >= 5200);
  }
});

test("persistent throttling is bounded; upstream outages and unavailable settings are distinct", async () => {
  let calls = 0;
  const { load } = setup(async () => {
    calls++;
    return Response.json({ response_code: 5 });
  });
  await assert.rejects(load("?amount=5"), /Trivia is busy/);
  assert.equal(calls, 2);
  for (const [response, message] of [
    [
      () => new Response("gateway unavailable", { status: 503 }),
      /temporarily unavailable/,
    ],
    [
      () => Response.json({ response_code: 1, results: [] }),
      /Not enough questions/,
    ],
    [() => Response.json({ response_code: 2 }), /settings are invalid/],
    [
      () => Response.json({ response_code: 0, results: [{}] }),
      /load the quiz questions/,
    ],
    [() => new Response("not JSON"), /load the quiz questions/],
    [() => Response.json(null), /load the quiz questions/],
    [
      () => Response.json({ response_code: 0, results: [null] }),
      /load the quiz questions/,
    ],
  ]) {
    let attempts = 0;
    const { load } = setup(async () => {
      attempts++;
      return response();
    });
    await assert.rejects(load("?amount=5"), message);
    assert.equal(attempts, 1);
  }
});

test("failed trivia requests release the queue and can be retried", async () => {
  let calls = 0;
  const { load, waits } = setup(async () => {
    if (++calls === 1) throw new TypeError("network failed");
    return success();
  });
  await assert.rejects(load("?amount=5"), /Check your internet connection/);
  assert.deepEqual(await load("?amount=5"), [question]);
  assert.deepEqual(waits, [5200]);
});
