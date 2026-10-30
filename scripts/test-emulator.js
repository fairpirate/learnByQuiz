import { spawn } from "node:child_process";
// Do not pass provider credentials to Firebase CLI. Older CLI versions can print
// their child environment in debug logs. The demo emulator needs no cloud keys.
const allowed = [
  "PATH",
  "HOME",
  "JAVA_HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "SystemRoot",
  "COMSPEC",
  "PATHEXT",
  "NODE_EXTRA_CA_CERTS",
];
const env = Object.fromEntries(
  allowed
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
env.FIREBASE_CLI_DISABLE_UPDATE_CHECK = "true";
const executable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const child = spawn(
  executable,
  [
    "emulators:exec",
    "--config",
    "firebase.emulator.json",
    "--project",
    "demo-learnbyquiz",
    "--only",
    "firestore",
    "npm run test:firestore",
  ],
  { env, stdio: "inherit" },
);
child.on("error", () => {
  console.error(
    "Firebase CLI is required for emulator verification. See README setup instructions.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
