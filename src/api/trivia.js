import { UserFacingError } from "../../shared/user-errors.js";
const COOLDOWN_MS = 5200;

export function createTriviaClient({
  fetchImpl = fetch,
  now = Date.now,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let nextRequestAt = 0;
  let queue = Promise.resolve();
  const active = new Map();

  return function loadQuestions(query, { onWait = () => {} } = {}) {
    const params = new URLSearchParams(query);
    if (!params.has("amount")) params.set("amount", "5");
    params.sort();
    const key = params.toString();
    if (active.has(key)) return active.get(key);

    const operation = queue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const delay = Math.max(0, nextRequestAt - now());
        if (delay) {
          onWait();
          await wait(delay);
        }
        nextRequestAt = now() + COOLDOWN_MS;
        let response;
        try {
          response = await fetchImpl(`https://opentdb.com/api.php?${key}`, {
            signal: AbortSignal.timeout(15000),
          });
        } catch (error) {
          throw new UserFacingError(
            error.name === "TimeoutError" || error.name === "AbortError"
              ? "REQUEST_TIMEOUT"
              : "NETWORK_ERROR",
          );
        }
        let data;
        if (response.ok) {
          try {
            data = await response.json();
          } catch {
            throw new UserFacingError("TRIVIA_INVALID_RESPONSE");
          }
        }
        if (response.status === 429 || data?.response_code === 5) {
          const header = response.headers.get("retry-after");
          const seconds = header && /^\d+$/.test(header) ? Number(header) : 0;
          const until =
            header && !/^\d+$/.test(header) ? Date.parse(header) : 0;
          const retryDelay = Math.min(
            30000,
            Math.max(COOLDOWN_MS, seconds * 1000, (until || 0) - now()),
          );
          nextRequestAt = now() + retryDelay;
          if (attempt === 0) continue;
          throw new UserFacingError("TRIVIA_BUSY");
        }
        if (!response.ok) throw new UserFacingError("TRIVIA_UNAVAILABLE");
        if (data?.response_code === 1)
          throw new UserFacingError("TRIVIA_NO_QUESTIONS");
        if (data?.response_code === 2)
          throw new UserFacingError("TRIVIA_SETTINGS");
        const valid =
          data?.response_code === 0 &&
          Array.isArray(data.results) &&
          data.results.length > 0 &&
          data.results.length <= 50 &&
          data.results.every(
            (question) =>
              question &&
              typeof question === "object" &&
              ["category", "question", "correct_answer", "difficulty"].every(
                (field) =>
                  typeof question[field] === "string" &&
                  question[field].length > 0,
              ) &&
              Array.isArray(question.incorrect_answers) &&
              question.incorrect_answers.length > 0 &&
              question.incorrect_answers.length <= 3 &&
              question.incorrect_answers.every(
                (answer) => typeof answer === "string",
              ),
          );
        if (!valid) throw new UserFacingError("TRIVIA_INVALID_RESPONSE");
        return data.results;
      }
    });
    queue = operation.then(
      () => {},
      () => {},
    );
    const result = operation.finally(() => active.delete(key));
    active.set(key, result);
    return result;
  };
}

export const loadTriviaQuestions = createTriviaClient();
