import React from "react";
import { Link } from "react-router-dom";
import AnimateProvider from "../../components/AnimateProvider/AnimateProvider";

function TermsConditions() {
  return (
    <AnimateProvider className="flex flex-col md:max-w-xl mx-auto p-4 md:p-8">
      <h1 className="font-bold text-lg md:text-xl text-neutral-900 mb-6">
        Terms &amp; Conditions
      </h1>
      <p className="text-xs md:text-sm text-neutral-500 mb-4">
        Last updated: December 2026
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        1. Acceptance of terms
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        By accessing or using Quiz 2 Learn and by creating an account, you agree
        to be bound by these Terms &amp; Conditions. If you do not agree, you
        may not use the service.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        2. User accounts
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        You must provide accurate and complete information when registering. You
        are responsible for maintaining the confidentiality of your account
        credentials and for all activity under your account.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        3. Acceptable use
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        You agree to use the service only for lawful purposes and in accordance
        with these terms. You may not reverse-engineer, scrape or otherwise
        attempt to disrupt the service or its underlying AI learning features.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        4. Content and AI-generated material
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        Quizzes and explanations may be generated using AI. Such content is
        provided "as is" for educational purposes and may not always be accurate
        or complete. Verify important information independently.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        5. Termination
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        We may suspend or terminate your account at our discretion, with or
        without notice, for violation of these terms.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        6. Disclaimer of warranties
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        The service is provided on an "as is" and "as available" basis without
        warranties of any kind, express or implied, to the fullest extent
        permitted by law.
      </p>

      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-6">
        Please also read our{" "}
        <Link
          to="/privacy-policy"
          className="text-green-400 underline underline-offset-4 hover:text-green-500"
        >
          Privacy Policy
        </Link>
        .
      </p>

      <Link
        to="/register"
        className="inline-block text-green-400 text-xs md:text-sm hover:text-green-500"
      >
        ← Back to Sign Up
      </Link>
    </AnimateProvider>
  );
}

export default TermsConditions;
