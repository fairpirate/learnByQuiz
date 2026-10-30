import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../config/firebase";
let authReady;
function waitForAuth() {
  authReady ||= new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, () => {
      stop();
      resolve();
    });
  });
  return authReady;
}
export async function learningApi(path, { method = "GET", body, signal } = {}) {
  await waitForAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again to use your learning journey.");
  const token = await user.getIdToken();
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  if (response.status === 204) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The learning API is unavailable. Start the backend and try again.",
    );
  }
  if (!response.ok)
    throw new Error(data.error?.message || "The request failed. Please retry.");
  return data;
}
