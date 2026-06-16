import type { SurveyQuestion } from "@survey-portal/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { formatQuestionType } from "./SurveyBuilderComponents.js";

// One compact, draggable question row on the Organize board. No option/tag
// editors — the heavy editing lives on the Questions tab. Drag is initiated
// only from the handle so the Delete button stays clickable.
export function OrganizeQuestionRow({
  disabled,
  isSubmitting,
  locator,
  onDelete,
  question
}: {
  disabled: boolean;
  isSubmitting: boolean;
  locator: string;
  onDelete: (questionId: number) => void;
  question: SurveyQuestion;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { pageId: question.pageId, type: "question" },
    disabled,
    id: `q:${question.id}`
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition
  };

  return (
    <div
      className={isDragging ? "compact-question-row dragging" : "compact-question-row"}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`Reorder ${locator}`}
        className="drag-handle"
        disabled={disabled}
        type="button"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <div className="compact-question-row-body">
        <span className="compact-question-row-locator">{locator}</span>
        <span className="compact-question-row-text">{question.questionText}</span>
      </div>
      <span className="compact-question-row-type">{formatQuestionType(question.questionType)}</span>
      <button
        className="button-link compact-button danger-button"
        disabled={disabled || isSubmitting}
        onClick={() => onDelete(question.id)}
        type="button"
      >
        Delete
      </button>
    </div>
  );
}
