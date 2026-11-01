import { create } from "zustand";
import { persist } from "zustand/middleware";
import { loadTriviaQuestions } from "../api/trivia";

let activeRequest;
let requestVersion = 0;

const useQuestionStore = create(
  persist(
    (set) => ({
      question: [],
      userAnswer: [],
      error: null,
      loading: false,
      loadingMessage: "Loading questions…",
      totalTime: 0,
      trueAnswer: 0,
      falseAnswer: 0,
      auth: {},
      page: 1,
      fetchQuestion: (query) => {
        if (activeRequest) return activeRequest;
        const version = ++requestVersion;
        set({
          error: null,
          loading: true,
          loadingMessage: "Loading questions…",
        });
        activeRequest = loadTriviaQuestions(query, {
          onWait: () => {
            if (version === requestVersion)
              set({ loadingMessage: "Trivia is busy. Retrying shortly…" });
          },
        })
          .then((questions) => {
            if (version === requestVersion)
              set({ question: questions, error: null });
          })
          .catch((error) => {
            if (version === requestVersion) set({ error: error.message });
          })
          .finally(() => {
            if (version === requestVersion) {
              activeRequest = null;
              set({ loading: false });
            }
          });
        return activeRequest;
      },

      authUser: (auth) => set((state) => ({ ...state, auth })),
      addAnswer: ({ question, answer }) =>
        set((state) => ({
          ...state,
          userAnswer: [...state.userAnswer, { question, answer }],
        })),
      trueAction: () =>
        set((state) => ({ ...state, trueAnswer: state.trueAnswer + 1 })),
      falseAction: () =>
        set((state) => ({ ...state, falseAnswer: state.falseAnswer + 1 })),
      logoutUser: () => {
        requestVersion++;
        activeRequest = null;
        set({
          question: [],
          userAnswer: [],
          error: null,
          loading: false,
          totalTime: 0,
          trueAnswer: 0,
          falseAnswer: 0,
          auth: {},
          page: 1,
        });
      },
      resetQuestion: () => {
        requestVersion++;
        activeRequest = null;
        set((state) => ({
          ...state,
          question: [],
          userAnswer: [],
          totalTime: 0,
          trueAnswer: 0,
          falseAnswer: 0,
          error: null,
          loading: false,
          page: 1,
        }));
      },
      setTimeStamp: (time) =>
        set((state) => ({
          ...state,
          totalTime: time,
        })),
      nextPage: () =>
        set((state) => ({
          ...state,
          page: state.page + 1,
        })),
    }),
    {
      name: "question-storage",
      partialize: ({ error, loading, loadingMessage, ...state }) => state,
      merge: (persisted, current) => ({
        ...current,
        ...persisted,
        error: null,
        loading: false,
        loadingMessage: "Loading questions…",
      }),
    },
  ),
);

export default useQuestionStore;
