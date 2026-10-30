import he from "he";
import { useMemo } from "react";
import Option from "../Option/Option";
import useQuestionStore from "../../store/zustand";

function Question({ id, handleClick, singleQuestion, summary }) {
  const { incorrect_answers, correct_answer, question } = singleQuestion;
  const { userAnswer: allUserAnswer } = useQuestionStore();

  const userAnswer = allUserAnswer.find((ans) => ans.question === question);

  const options = useMemo(() => {
    const items = [...incorrect_answers, correct_answer];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }, [question, incorrect_answers, correct_answer]);

  return (
    <section>
      <div className="flex items-start space-x-3 text-base md:text-lg mb-10">
        <h3 className="text-gray-800 font-semibold text-center">{id}.</h3>

        <h3 className="text-gray-800 font-semibold">{he.decode(question)}</h3>
      </div>

      {options.map((opt, i) => (
        <Option
          key={i}
          value={opt}
          idx={i}
          handleClick={handleClick}
          trueAnswer={correct_answer}
          userAnswer={userAnswer}
          summary={summary}
        />
      ))}
    </section>
  );
}

export default Question;
