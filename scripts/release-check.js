import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  "test",
  "test:emulator",
  "test:browser",
  "build",
  "format:check",
];
if (process.argv.includes("--live"))
  checks.push("test:live:qloo", "test:live:firebase", "verify:live");
const report = { checkedAt: new Date().toISOString(), checks: [], ok: true };
function run(script) {
  return new Promise((resolve) => {
    const child = spawn(npm, ["run", script], { stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
for (const name of checks) {
  const started = Date.now();
  const code = await run(name);
  report.checks.push({
    name,
    status: code === 0 ? "passed" : "failed",
    durationMs: Date.now() - started,
  });
  if (code !== 0) report.ok = false;
}
if (process.argv.includes("--live")) {
  if (report.ok) {
    const code = await run("test:live:fullstack");
    report.checks.push({
      name: "test:live:fullstack",
      status: code === 0 ? "passed" : "failed",
    });
    if (code !== 0) report.ok = false;
  } else {
    report.checks.push({
      name: "test:live:fullstack",
      status: "blocked",
      reason:
        "Release preconditions failed; no full-stack test accounts were created.",
    });
    report.ok = false;
  }
}
await writeFile(
  "docs/release-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.info(
  `Release verification: ${report.ok ? "PASSED" : "FAILED"}. See docs/release-verification.json.`,
);
process.exitCode = report.ok ? 0 : 1;
