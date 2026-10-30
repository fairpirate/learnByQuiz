import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import useQuestionStore from "../../store/zustand";
import AnimateProvider from "../../components/AnimateProvider/AnimateProvider";

function Question() {
  const { fetchQuestion, question: questionData, error } = useQuestionStore();
  const { search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!questionData?.length && !error) {
      fetchQuestion(search);
    }
  }, [questionData, search, error, fetchQuestion]);

  if (error)
    return (
      <div role="alert">
        <p>{String(error)}</p>
        <button onClick={() => fetchQuestion(search)}>Retry</button>
      </div>
    );
  if (!questionData?.length) return <p role="status">Loading...</p>;

  return (
    <AnimateProvider className="max-w-xl mx-auto ">
      <h1 className="text-base md:text-lg font-semibold mb-5 text-orange-900">
        Quizzz Info
      </h1>

      <div className="flex flex-col text-gray-900 space-y-3 text-xs md:text-sm">
        <div className="flex space-x-5">
          <p className="min-w-[170px]">Number of questions </p>
          <p className="font-bold">{questionData.length}</p>
        </div>

        <div className="flex space-x-5">
          <p className="min-w-[170px]">Category </p>
          <p className="font-bold text-green-400">{questionData[0].category}</p>
        </div>

        <div className="flex space-x-5">
          <p className="min-w-[170px] ">Difficulty</p>
          <p className="font-bold capitalize text-lime-600">
            {questionData[0].difficulty}
          </p>
        </div>

        <div className="flex space-x-5">
          <p className="min-w-[170px]">Time </p>
          <p className="font-bold">3 mins.</p>
        </div>
      </div>

      <button
        disabled={!questionData}
        onClick={() => {
          navigate(`/question/1`);
        }}
        className="flex w-full rounded-full bg-green-400 cursor-pointer disabled:bg-green-400/50 disabled:cursor-not-allowed p-1 justify-center font-semibold md:font-bold text-base md:text-lg text-center mt-10 text-white hover:bg-green-400"
      >
        Start
      </button>
    </AnimateProvider>
  );
}

export default Question;
