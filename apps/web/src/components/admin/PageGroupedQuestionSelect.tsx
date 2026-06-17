import { getOrderedPages, type Survey, type SurveyQuestion } from "@survey-portal/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatQuestionOptionLabel } from "./SurveyBuilderComponents.js";

const UNGROUPED_KEY = -1;

// A select-like control that groups its questions under collapsible page
// headers, so a long source-question list stays organized as a survey grows.
// A hidden input carries the chosen id so it still participates in FormData.
export function PageGroupedQuestionSelect({
  disabled = false,
  fieldLabel,
  name,
  onChange,
  placeholder,
  questions,
  survey,
  value
}: {
  disabled?: boolean;
  fieldLabel: string;
  name: string;
  onChange: (questionId: number | null) => void;
  placeholder: string;
  questions: SurveyQuestion[];
  survey: Survey;
  value: number | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsedPageKeys, setCollapsedPageKeys] = useState<ReadonlySet<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const orderedPages = getOrderedPages(survey);
    const grouped = orderedPages
      .map((page) => ({
        page,
        items: questions.filter((question) => question.pageId === page.id)
      }))
      .filter((group) => group.items.length > 0);
    const ungrouped = questions.filter(
      (question) => !orderedPages.some((page) => page.id === question.pageId)
    );

    return ungrouped.length > 0 ? [...grouped, { page: null, items: ungrouped }] : grouped;
  }, [questions, survey]);

  const selectedQuestion =
    value === null ? null : questions.find((question) => question.id === value) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointer(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  function toggleGroup(pageKey: number) {
    setCollapsedPageKeys((current) => {
      const next = new Set(current);

      if (next.has(pageKey)) {
        next.delete(pageKey);
      } else {
        next.add(pageKey);
      }

      return next;
    });
  }

  return (
    <div className="grouped-select-field">
      <span className="grouped-select-field-label">{fieldLabel}</span>
      <div className="grouped-select" ref={containerRef}>
        <input name={name} type="hidden" value={value ?? ""} />
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="grouped-select-button"
          disabled={disabled}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <span
            className={selectedQuestion ? "grouped-select-value" : "grouped-select-placeholder"}
          >
            {selectedQuestion ? formatQuestionOptionLabel(survey, selectedQuestion) : placeholder}
          </span>
          <span aria-hidden="true" className="grouped-select-caret">
            ▾
          </span>
        </button>
        {isOpen && !disabled ? (
          <div className="grouped-select-panel" role="listbox">
            {groups.length === 0 ? (
              <p className="grouped-select-empty">No eligible questions</p>
            ) : (
              groups.map(({ page, items }) => {
                const pageKey = page?.id ?? UNGROUPED_KEY;
                const isCollapsed = collapsedPageKeys.has(pageKey);

                return (
                  <div className="grouped-select-group" key={pageKey}>
                    <button
                      aria-expanded={!isCollapsed}
                      className="grouped-select-group-header"
                      onClick={() => toggleGroup(pageKey)}
                      type="button"
                    >
                      <span aria-hidden="true" className="grouped-select-group-caret">
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                      <span className="grouped-select-group-title">
                        {page ? `Page ${page.displayOrder} — ${page.title}` : "Other questions"}
                      </span>
                      <span className="grouped-select-group-count">{items.length}</span>
                    </button>
                    {!isCollapsed ? (
                      <ul className="grouped-select-options">
                        {items.map((question) => (
                          <li key={question.id}>
                            <button
                              aria-selected={question.id === value}
                              className={
                                question.id === value
                                  ? "grouped-select-option selected"
                                  : "grouped-select-option"
                              }
                              onClick={() => {
                                onChange(question.id);
                                setIsOpen(false);
                              }}
                              role="option"
                              type="button"
                            >
                              {formatQuestionOptionLabel(survey, question)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
