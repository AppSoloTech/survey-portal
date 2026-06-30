import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const surveyCardSource = readFileSync(
  new URL("./SurveySummaryCard.tsx", import.meta.url),
  "utf8"
);
const dashboardSource = readFileSync(new URL("../pages/UserDashboard.tsx", import.meta.url), "utf8");
const categorySource = readFileSync(
  new URL("../pages/CategorySurveysPage.tsx", import.meta.url),
  "utf8"
);
const anonymousDirectorySource = readFileSync(
  new URL("../pages/AnonymousSurveyDirectoryPage.tsx", import.meta.url),
  "utf8"
);
const homeSource = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
const glossarySource = readFileSync(new URL("./InlineGlossaryText.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("user-facing accessibility polish", () => {
  it("adds survey title context inside repeated dashboard survey actions", () => {
    expect(surveyCardSource).toContain('className="visually-hidden">: {summary.survey.title}');
  });

  it("adds category and resume context inside repeated dashboard actions", () => {
    expect(dashboardSource).toContain('className="visually-hidden">: {latest.survey.title}');
    expect(dashboardSource).toContain('className="visually-hidden"> in {group.categoryName}');
  });

  it("keeps category empty state polite without loading status animation", () => {
    expect(categorySource).toContain('className="builder-empty-state"');
    expect(categorySource).toContain('role="status"');
    expect(categorySource).toContain('aria-live="polite"');
    expect(categorySource).toContain("No surveys in this group.");
    expect(categorySource).not.toContain('<AlertMessage className="builder-empty-state"');
  });

  it("adds context to public anonymous survey entry links", () => {
    expect(anonymousDirectorySource).toContain(
      'className="visually-hidden">: {survey.surveyTitle}'
    );
    expect(homeSource).toContain('className="visually-hidden"> in the public directory');
  });

  it("uses stable described-by glossary definitions instead of aria-description", () => {
    expect(glossarySource).toContain("aria-describedby={popoverId}");
    expect(glossarySource).toContain("hidden={!isOpen}");
    expect(glossarySource).toContain('role="tooltip"');
    expect(stylesSource).toMatch(/\.inline-glossary-popover\[hidden\]\s*\{\s*display: none;/);
    expect(glossarySource).not.toContain("aria-description");
  });
});
