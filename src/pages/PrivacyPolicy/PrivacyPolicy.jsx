import React from "react";
import { Link } from "react-router-dom";
import AnimateProvider from "../../components/AnimateProvider/AnimateProvider";

function PrivacyPolicy() {
  return (
    <AnimateProvider className="flex flex-col md:max-w-xl mx-auto p-4 md:p-8">
      <h1 className="font-bold text-lg md:text-xl text-neutral-900 mb-6">
        Privacy Policy
      </h1>
      <p className="text-xs md:text-sm text-neutral-500 mb-4">
        Last updated: December 2026
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        1. Information we collect
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        We collect the name, email address and password you provide when you
        create an account, as well as your learning activity and preferences so
        we can personalize your quizzes and track your progress.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        2. How we use your information
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        Your data is used to authenticate your account, generate and deliver
        learning content, save your quiz results, and improve the service. We do
        not sell your personal information to third parties.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        3. Data security
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        Account data is stored with Firebase Authentication and Firestore. We
        take reasonable technical and organizational measures to protect your
        information against unauthorized access, alteration or disclosure.
      </p>

      <h2 className="font-semibold text-neutral-800 mb-2 text-xs md:text-sm">
        4. Your rights
      </h2>
      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-4">
        You may access, correct or delete your personal data at any time by
        contacting us. Deleting your account removes your profile and learning
        history from our systems.
      </p>

      <p className="text-xs md:text-sm text-neutral-600 leading-relaxed mb-6">
        By creating an account you also agree to our{" "}
        <Link
          to="/terms-conditions"
          className="text-green-400 underline underline-offset-4 hover:text-green-500"
        >
          Terms &amp; Conditions
        </Link>
        .
      </p>

      <p className="text-xs md:text-sm text-neutral-600 mb-3">
        Questions about this policy? Contact us at{" "}
        <a
          href="mailto:support@learnbyquiz.example"
          className="text-green-400 underline underline-offset-4 hover:text-green-500"
        >
          support@learnbyquiz.example
        </a>
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

export default PrivacyPolicy;
