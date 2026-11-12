import he from "he";
import { useMemo } from "react";
import DataGrid from "../Grid/DataGrid";
import useQuestionStore from "../../store/zustand";

export default function Question({ id, handleClick, singleQuestion, summary }) {
  const { incorrect_answers, correct_answer, question } = singleQuestion;
  const allUserAnswer = useQuestionStore((s) => s.userAnswer);
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
      <h3 className="text-gray-800 font-semibold mb-5">
        {id}. {he.decode(question)}
      </h3>
      <DataGrid
        label={`Question ${id} options`}
        searchable={false}
        exportable={false}
        paginate={false}
        rows={options.map((option) => ({ option }))}
        columns={[
          {
            headerName: "Option",
            valueGetter: (p) => he.decode(p.data.option),
            minWidth: 180,
          },
          {
            headerName: summary ? "Result" : "Answer",
            filter: false,
            sortable: false,
            minWidth: 180,
            cellRenderer: ({ data }) =>
              summary ? (
                <span>
                  {data.option === correct_answer ? "✓ Correct answer" : ""}
                  {userAnswer?.answer === data.option ? " · Your answer" : ""}
                </span>
              ) : (
                <button
                  type="button"
                  className="rounded bg-green-700 text-white px-3 py-2"
                  onClick={() => handleClick(data.option)}
                >
                  Choose {he.decode(data.option)}
                </button>
              ),
          },
        ]}
      />
    </section>
  );
}
