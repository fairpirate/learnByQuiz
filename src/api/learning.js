import { UserFacingError } from "../../shared/user-errors.js";
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
  if (!user) throw new UserFacingError("UNAUTHENTICATED");
  let token;
  try {
    token = await user.getIdToken();
  } catch (error) {
    throw new UserFacingError(error.code || "UNAUTHENTICATED");
  }
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
  } catch (error) {
    throw new UserFacingError(
      error.name === "AbortError"
        ? "REQUEST_CANCELLED"
        : error.name === "TimeoutError"
          ? "REQUEST_TIMEOUT"
          : "NETWORK_ERROR",
    );
  }
  if (response.status === 204) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new UserFacingError("SERVICE_UNAVAILABLE");
  }
  if (!response.ok)
    throw new UserFacingError(data?.error?.code, {
      status: response.status,
      requestId: data?.error?.requestId,
    });
  return data;
}
