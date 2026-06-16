import type { SurveyPage } from "@survey-portal/shared";

// Page navigation for the Questions tab: a single dropdown (scales to any number
// of pages) flanked by prev/next stepper arrows for quick adjacent paging. The
// active page's question count shows in each option.
export function PageSwitcher({
  activePageId,
  onSelect,
  pages,
  questionCountByPage
}: {
  activePageId: number | null;
  onSelect: (pageId: number) => void;
  pages: SurveyPage[];
  questionCountByPage: Map<number, number>;
}) {
  if (pages.length === 0) {
    return null;
  }

  const activeIndex = pages.findIndex((page) => page.id === activePageId);

  function step(delta: number) {
    const next = pages[activeIndex + delta];

    if (next) {
      onSelect(next.id);
    }
  }

  return (
    <div className="page-switcher">
      <span className="page-switcher-label">Editing page</span>
      <button
        aria-label="Previous page"
        className="page-switcher-step"
        disabled={activeIndex <= 0}
        onClick={() => step(-1)}
        type="button"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <select
        aria-label="Select page to edit"
        className="page-switcher-select"
        onChange={(event) => onSelect(Number(event.target.value))}
        value={activePageId ?? ""}
      >
        {pages.map((page) => (
          <option key={page.id} value={page.id}>
            {page.displayOrder}. {page.title} ({questionCountByPage.get(page.id) ?? 0})
          </option>
        ))}
      </select>
      <button
        aria-label="Next page"
        className="page-switcher-step"
        disabled={activeIndex < 0 || activeIndex >= pages.length - 1}
        onClick={() => step(1)}
        type="button"
      >
        <span aria-hidden="true">›</span>
      </button>
      <span className="page-switcher-meta">
        {activeIndex >= 0 ? activeIndex + 1 : 1} of {pages.length}
      </span>
    </div>
  );
}
