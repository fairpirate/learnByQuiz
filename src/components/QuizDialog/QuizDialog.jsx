import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function QuizDialog({
  title,
  description,
  reviewing,
  returnFocusId,
  busy,
  onClose,
  children,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        const target = document.getElementById(returnFocusId) || previousFocus;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, [returnFocusId]);
  return createPortal(
    <dialog
      ref={ref}
      className="journey journey-quiz-dialog"
      aria-labelledby="journey-quiz-title"
      aria-describedby="journey-quiz-description"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || busy) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="journey-quiz-header">
        <div>
          <p className="eyebrow">
            {reviewing ? "Quiz review" : "Your learning session"}
          </p>
          <h2 id="journey-quiz-title">{title}</h2>
          <p id="journey-quiz-description" className="journey-muted">
            {description}
          </p>
        </div>
        <button
          type="button"
          className="secondary journey-quiz-close"
          aria-label="Close quiz"
          disabled={busy}
          onClick={onClose}
          autoFocus
        >
          Close <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="journey-quiz-content">{children}</div>
    </dialog>,
    document.body,
  );
}
