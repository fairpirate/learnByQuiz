import test from "node:test";
import assert from "node:assert/strict";
import { createTriviaClient } from "../../src/api/trivia.js";

test(
  "live classic trivia returns real questions using the browser client",
  { timeout: 65000 },
  async () => {
    const questions = await createTriviaClient()(
      "?amount=5&category=9&difficulty=easy&type=multiple",
    );
    assert.equal(questions.length, 5);
    assert.ok(
      questions.every((question) => question.incorrect_answers.length === 3),
    );
  },
);
