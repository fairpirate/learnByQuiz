import useQuestionStore from "../../store/zustand";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import TimeStamp from "../../components/TimeStamp/TimeStamp";
import AnimateProvider from "../../components/AnimateProvider/AnimateProvider";
import Question from "../../components/Questions/Questions";

function SingleQuestion() {
  const navigate = useNavigate();
  const {
    question: allQuestion,
    trueAction,
    falseAction,
    addAnswer,
    page,
    nextPage,
  } = useQuestionStore();

  const { id } = useParams();

  const singleQuestion = allQuestion?.[page - 1];
  if (!singleQuestion)
    return <Navigate to={allQuestion.length ? "/finish" : "/"} replace />;
  if (Number(id) !== page) return <Navigate to={`/question/${page}`} replace />;
  const { correct_answer } = singleQuestion;

  const handleClick = (value) => {
    //Add answer
    addAnswer({ question: singleQuestion.question, answer: value });

    //Verify Answer
    if (value === correct_answer) {
      trueAction();
    } else {
      falseAction();
    }

    nextPage();

    navigate(page === allQuestion.length ? "/finish" : `/question/${page + 1}`);
  };

  return (
    <AnimateProvider className="max-w-4xl mx-auto">
      <div className="flex max-w-fit flex-col ml-auto space-x-3 mb-10">
        <TimeStamp />
      </div>

      <Question
        id={page}
        handleClick={handleClick}
        singleQuestion={singleQuestion}
      />
    </AnimateProvider>
  );
}

export default SingleQuestion;
