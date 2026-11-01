import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

test(
  "production entry serves built assets, protects API and shuts down cleanly",
  { timeout: 20000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    // Synthetic credentials are confined to this smoke test. No provider calls
    // are made here; the live suite separately verifies real services.
    const child = spawn(process.execPath, ["server/index.js"], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        PORT: String(port),
        DOTENV_CONFIG_PATH: "/dev/null",
        FIREBASE_PROJECT_ID: "demo-learnbyquiz",
        QLOO_API_KEY: "smoke-test",
        LLM_PROVIDER: "nvidia",
        NVIDIA_API_KEY: "smoke-test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ended = once(child, "exit");
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    try {
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error(`Startup timed out: ${output}`)),
          10000,
        );
        child.stdout.on("data", () => {
          if (output.includes("LearnByQuiz API listening")) {
            clearTimeout(deadline);
            resolve();
          }
        });
        child.once("error", (error) => {
          clearTimeout(deadline);
          reject(error);
        });
        child.once("exit", () => {
          clearTimeout(deadline);
          reject(new Error(`Production server exited: ${output}`));
        });
      });
      const origin = `http://127.0.0.1:${port}`;
      const health = await fetch(`${origin}/api/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });
      const html = await fetch(`${origin}/journey`);
      assert.equal(html.status, 200);
      assert.equal(html.headers.get("cache-control"), "no-cache");
      assert.ok(html.headers.get("content-security-policy"));
      const source = await html.text();
      const asset = /src="(\/assets\/[^" ]+\.js)"/.exec(source)?.[1];
      assert.ok(asset, "HTML must reference a built JavaScript asset");
      const javascript = await fetch(`${origin}${asset}`);
      assert.equal(javascript.status, 200);
      assert.match(javascript.headers.get("cache-control"), /immutable/);
      await javascript.arrayBuffer();
      const protectedRoute = await fetch(`${origin}/api/taste/profile`);
      assert.equal(protectedRoute.status, 401);
      assert.equal(protectedRoute.headers.get("cache-control"), "no-store");
      await protectedRoute.json();
    } finally {
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 8000);
      const [code] = await ended;
      clearTimeout(force);
      assert.equal(code, 0, "Production process must shut down gracefully");
    }
  },
);
