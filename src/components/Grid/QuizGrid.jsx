import { useMemo } from "react";
import DataGrid from "./DataGrid";
function AnswerCell({ data, context }) {
  if (data.review)
    return (
      <span>
        {data.options[data.review.answer]} {data.review.correct ? "✓" : "×"}
      </span>
    );
  return (
    <div className="grid-answers">
      {data.options.map((option, j) => (
        <label key={j}>
          <input
            type="radio"
            name={`q${data.index}`}
            aria-label={`Question ${data.index + 1}: ${option}`}
            checked={data.answer === j}
            disabled={context.disabled}
            onChange={() => context.onAnswer(data.index, j)}
          />
          {option}
        </label>
      ))}
    </div>
  );
}
export default function QuizGrid({
  questions,
  answers,
  onAnswer,
  disabled = false,
  performance,
}) {
  const review = !!performance;
  const columns = useMemo(
    () => [
      {
        headerName: "#",
        autoHeight: false,
        valueGetter: (p) => p.data.index + 1,
        minWidth: 55,
        maxWidth: 70,
        sortable: false,
        filter: false,
      },
      {
        field: "question",
        headerName: "Question",
        minWidth: 190,
        flex: 2,
        autoHeight: review,
      },
      {
        field: "answer",
        autoHeight: review,
        headerName: review ? "Your answer" : "Choose your answer",
        minWidth: 230,
        flex: 2,
        sortable: false,
        filter: false,
        cellRenderer: AnswerCell,
        cellRendererParams: { suppressMouseEventHandling: () => true },
      },
      ...(review
        ? [
            {
              headerName: "Correct answer",
              valueGetter: (p) => p.data.options[p.data.review.correctIndex],
              minWidth: 180,
            },
            {
              headerName: "Explanation",
              valueGetter: (p) => p.data.review.explanation,
              minWidth: 250,
              flex: 3,
            },
          ]
        : []),
    ],
    [review],
  );
  const rows = questions.map((q, index) => ({
    ...q,
    index,
    answer: performance?.items[index].answer ?? answers[index],
    review: performance?.items[index],
  }));
  return (
    <DataGrid
      label={review ? "Quiz answer review" : "Quiz questions"}
      rows={rows}
      getRowHeight={
        review
          ? undefined
          : ({ data, api }) => {
              const lines = (text, width) =>
                Math.max(
                  1,
                  Math.ceil(
                    String(text).length / Math.max(10, (width - 36) / 9),
                  ),
                );
              const answerWidth =
                api.getColumn("answer")?.getActualWidth() || 230;
              const questionWidth =
                api.getColumn("question")?.getActualWidth() || 190;
              return Math.max(
                180,
                lines(data.question, questionWidth) * 24 + 28,
                data.options.reduce(
                  (height, option) =>
                    height + lines(option, answerWidth) * 24 + 12,
                  28,
                ),
              );
            }
      }
      context={{ disabled, onAnswer }}
      searchable={false}
      exportable={review}
      paginate={false}
      columns={columns}
    />
  );
}
