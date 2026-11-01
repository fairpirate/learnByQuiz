import test from "node:test";
import assert from "node:assert/strict";
import { runtimeConfiguration } from "../runtime-config.js";
import { inspectConfiguration } from "../readiness.js";

test("runtime rejects invalid ports and blanket proxy trust", () => {
  for (const PORT of ["0", "-1", "65536", "3.5", "invalid"])
    assert.throws(() => runtimeConfiguration({ PORT }));
  for (const TRUST_PROXY of ["true", "false", "1", "2"])
    assert.throws(() => runtimeConfiguration({ TRUST_PROXY }));
  assert.deepEqual(runtimeConfiguration({}), { port: 3001, trustProxy: false });
  assert.deepEqual(
    runtimeConfiguration({ PORT: "8080", TRUST_PROXY: "loopback, 10.0.0.0/8" }),
    { port: 8080, trustProxy: ["loopback", "10.0.0.0/8"] },
  );
});

test("production runtime accepts build-time-only browser configuration", () => {
  const env = {
    FIREBASE_PROJECT_ID: "demo",
    QLOO_API_KEY: "test",
    LLM_PROVIDER: "nvidia",
    NVIDIA_API_KEY: "test",
  };
  assert.equal(inspectConfiguration(env, { browser: false }).ok, true);
  assert.equal(inspectConfiguration(env).ok, false);
});
