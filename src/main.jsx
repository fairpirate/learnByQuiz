import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
const Journey = React.lazy(() => import("./pages/Journey/Journey"));
import "./index.css";
import { action as registerAction } from "./pages/Register/RegisterPage";
import { action as loginAction } from "./pages/Login/LoginPage";
import RootLayout from "./layout/RootLayout";

import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
} from "react-router-dom";

import LoginPage from "./pages/Login/LoginPage";
import Question from "./pages/Question/Question";
import RegisterPage from "./pages/Register/RegisterPage";
import PrivacyPolicy from "./pages/PrivacyPolicy/PrivacyPolicy";
import TermsConditions from "./pages/TermsConditions/TermsConditions";
import NotFound from "./pages/NotFound/NotFound";
import RequireAuth from "./pages/Require/RequireAuth";
import RequireLogout from "./pages/Require/RequireLogout";
const SingleQuestion = React.lazy(
  () => import("./pages/Question/SingleQuestion"),
);
const Success = React.lazy(() => import("./pages/Success/Success"));
function QuizScreen({ children }) {
  return (
    <React.Suspense fallback={<p role="status">Loading quiz workspace…</p>}>
      {children}
    </React.Suspense>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<RootLayout />} errorElement={<NotFound />}>
      <Route element={<RequireLogout />}>
        {/* User Need to logout */}
        <Route path="login" element={<LoginPage />} action={loginAction} />
        <Route
          path="register"
          element={<RegisterPage />}
          action={registerAction}
        />
        <Route path="privacy-policy" element={<PrivacyPolicy />} />
        <Route path="terms-conditions" element={<TermsConditions />} />
      </Route>

      <Route element={<RequireAuth />}>
        {/* User need to login */}
        <Route index element={<App />} />
        <Route
          path="journey"
          element={
            <React.Suspense
              fallback={<p role="status">Loading your learning journey…</p>}
            >
              <Journey />
            </React.Suspense>
          }
        />
        <Route path="question" element={<Question />} />
        <Route
          path="question/:id"
          element={
            <QuizScreen>
              <SingleQuestion />
            </QuizScreen>
          }
        />
        <Route
          path="finish"
          element={
            <QuizScreen>
              <Success />
            </QuizScreen>
          }
        />
      </Route>
    </Route>,
  ),
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
