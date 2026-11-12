// Public copy only: shared by the API and browser so technical details never
// become user messages. Keep provider diagnostics in server-side errors/logs.
const messages = Object.freeze({
  UNAUTHENTICATED: "Your session has ended. Please sign in again to continue.",
  AUTH_SERVICE_UNAVAILABLE:
    "We can't sign you in right now. Please try again in a few minutes.",
  LEARNING_STORAGE_UNAVAILABLE:
    "We can't load or save your learning progress right now. Please try again shortly.",
  NETWORK_ERROR:
    "We couldn't connect. Check your internet connection and try again.",
  REQUEST_TIMEOUT:
    "This is taking longer than expected. Please try again shortly.",
  REQUEST_CANCELLED:
    "This action was cancelled. You can try again when you're ready.",
  SERVICE_UNAVAILABLE:
    "This service is temporarily unavailable. Please try again in a few minutes.",
  RATE_LIMITED:
    "You've made several requests in a short time. Please wait a minute and try again.",
  INVALID_INPUT:
    "Some information is missing or isn't valid. Check your choices and try again.",
  MALFORMED_JSON:
    "We couldn't send your information. Please refresh the page and try again.",
  PAYLOAD_TOO_LARGE:
    "There's too much information to save at once. Shorten your entry or select fewer items and try again.",
  NOT_FOUND:
    "We couldn't find what you requested. Refresh the page and try again.",
  PROFILE_REQUIRED:
    "Choose at least one favorite and one learning subject, then save your preferences.",
  INVALID_ENTITY:
    "We couldn't find that favorite. Search for it again and choose a result from the list.",
  NO_DISCOVERIES:
    "We couldn't find related interests for those choices. Try another category or add a different favorite.",
  AGENT_BUSY:
    "We're already preparing an activity for you. Please wait for it to finish.",
  INVALID_PLAN:
    "We couldn't create a suitable learning plan. Please try generating it again.",
  INVALID_QUIZ:
    "We couldn't prepare a complete quiz. Please try generating it again.",
  QUIZ_REJECTED:
    "We couldn't confirm the answers in this quiz, so it wasn't saved. Please generate another quiz.",
  QUIZ_NOT_FOUND:
    "This quiz is no longer available. Choose another quiz from your library.",
  QUIZ_NOT_STARTED:
    "Open the quiz with Start quiz before submitting your answers.",
  INVALID_ANSWERS:
    "Choose an answer for every question before submitting the quiz.",
  LLM_NOT_CONFIGURED:
    "AI learning isn't available yet. Please try a classic quiz or come back later.",
  LLM_AUTH_FAILED:
    "AI learning is temporarily unavailable. Please try a classic quiz or come back later.",
  LLM_BILLING_REQUIRED:
    "AI learning is temporarily unavailable. Buying more learning credits won't fix this. Please try a classic quiz or come back later.",
  LLM_MODEL_UNAVAILABLE:
    "AI learning is temporarily unavailable. Please try a classic quiz or come back later.",
  LLM_RATE_LIMIT:
    "AI learning is busy right now. Please wait a few minutes and try again.",
  LLM_UNAVAILABLE:
    "We couldn't finish creating your activity. Please try again shortly.",
  LLM_ERROR:
    "We couldn't create your activity right now. Please try again shortly.",
  LLM_INVALID_OUTPUT:
    "We couldn't prepare a complete activity. Please try generating it again.",
  PAYPAL_UNAVAILABLE:
    "PayPal checkout isn't available right now. Please try again later.",
  PAYPAL_REQUEST_FAILED:
    "We couldn't confirm the payment yet. Use Check payment in your payment history before starting another checkout.",
  PAYPAL_UNREACHABLE:
    "We couldn't reach PayPal. Use Check payment in your payment history before starting another checkout.",
  PAYMENT_DECLINED:
    "PayPal couldn't accept this payment. Please try another payment method.",
  PAYMENT_MISMATCH:
    "We couldn't verify this payment. Check its status in PayPal and contact support if it shows a charge.",
  INVALID_PAYPAL_RESPONSE:
    "We couldn't open PayPal checkout. Please try again shortly.",
  PURCHASE_NOT_FOUND:
    "We couldn't find this payment in your account. Check your payment history or sign in to the account you used to pay.",
  PURCHASE_CONFLICT:
    "This checkout was started for a different learning pack. Choose your pack again to start a new checkout.",
  ORDER_CONFLICT:
    "This checkout already has a payment in progress. Continue it from your payment history.",
  INVALID_PACK: "Choose one of the learning packs shown on this page.",
  CREDITS_REQUIRED:
    "You need more learning credits to create an AI activity. Choose a learning pack below, or take a free classic quiz.",
  INVALID_WEBHOOK:
    "We couldn't verify this payment update. Please check your payment history shortly.",
  TRIVIA_BUSY: "Trivia is busy. Please wait a few seconds and try again.",
  TRIVIA_UNAVAILABLE:
    "Quiz questions are temporarily unavailable. Please try again shortly.",
  TRIVIA_INVALID_RESPONSE:
    "We couldn't load the quiz questions. Please try again.",
  TRIVIA_NO_QUESTIONS:
    "Not enough questions match your choices. Choose another category or difficulty.",
  TRIVIA_SETTINGS:
    "These quiz settings are invalid. Choose another category or difficulty.",
  PASSWORD_MISMATCH:
    "Your passwords don't match. Enter the same password in both fields.",
  AUTH_FIELDS_REQUIRED: "Enter your email address and password to continue.",
  "auth/invalid-email":
    "Enter a valid email address, such as name@example.com.",
  "auth/missing-email": "Enter your email address to continue.",
  "auth/missing-password": "Enter your password to continue.",
  "auth/invalid-credential":
    "We couldn't sign you in. Check your email address and password and try again.",
  "auth/invalid-login-credentials":
    "We couldn't sign you in. Check your email address and password and try again.",
  "auth/wrong-password":
    "We couldn't sign you in. Check your email address and password and try again.",
  "auth/user-not-found":
    "We couldn't sign you in. Check your email address and password and try again.",
  "auth/email-already-in-use":
    "An account already uses this email address. Sign in or use a different email address.",
  "auth/weak-password":
    "Choose a stronger password with at least 6 characters.",
  "auth/password-does-not-meet-requirements":
    "This password doesn't meet the account requirements. Try a longer password with a mix of letters, numbers and symbols.",
  "auth/too-many-requests":
    "There have been too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed":
    "We couldn't connect. Check your internet connection and try again.",
  "auth/user-disabled":
    "This account is unavailable. Please contact support for help.",
  "auth/user-token-expired":
    "Your session has ended. Please sign in again to continue.",
  "auth/id-token-expired":
    "Your session has ended. Please sign in again to continue.",
  "auth/requires-recent-login":
    "Please sign in again before making this change.",
  "auth/operation-not-allowed":
    "Sign-in is temporarily unavailable. Please try again later.",
  "auth/internal-error":
    "We can't complete this account action right now. Please try again shortly.",
});
const fallbackMessage =
  "Something went wrong. Please try again. If it keeps happening, contact support.";

export function userErrorMessage(error, fallback = fallbackMessage) {
  if (error instanceof UserFacingError) return error.message;
  if (typeof error?.code === "string" && Object.hasOwn(messages, error.code))
    return messages[error.code];
  const status = Number(error?.status);
  if (status === 401) return messages.UNAUTHENTICATED;
  if (status === 403)
    return "You don't have access to this action. Sign in to the correct account or contact support.";
  if (status === 404) return messages.NOT_FOUND;
  if (status === 429) return messages.RATE_LIMITED;
  if (status >= 500) return messages.SERVICE_UNAVAILABLE;
  if (status >= 400) return messages.INVALID_INPUT;
  return fallback;
}

export class UserFacingError extends Error {
  constructor(code, { status, requestId } = {}) {
    super(userErrorMessage({ code, status }));
    this.name = "UserFacingError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}
