import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("SurveyAttemptPage participant accessibility", () => {
  it("renders semantic progress for the current assessment path", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("<progress");
    expect(source).toContain('aria-label="Assessment progress"');
    expect(source).toContain("on your current assessment path");
    expect(source).not.toMatch(/Question\s*\{[^}]+\}\s*of\s*\{[^}]+\}/);
  });

  it("renders a separate semantic issue profile thermometer without replacing assessment progress", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("IssueProfileThermometer");
    expect(source.match(/<IssueProfileThermometer/g)?.length).toBe(1);
    expect(source).toContain('aria-label="Issue profile progress"');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('role="status"');
    expect(source).toContain('className="survey-progress-meter"');
    expect(source).toContain('className="issue-profile-sticky-shell"');
    expect(source).toContain("displayFillPercent");
    expect(source).toContain("Issue profile in progress");
    expect(source).toContain("Profile building");
    expect(source).toContain("Profile complete");
  });

  it("renders a participant-safe emoji burst for ready-to-submit profile details", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(source).toContain("IssueProfileEmojiBurst");
    expect(source).toContain("IssueProfileEmojiCollection");
    expect(source).toContain("buildEmojiBurstParticles");
    expect(source).toContain("buildEmojiBurstSparks");
    expect(source).toContain('aria-hidden="true" className="issue-profile-emoji-burst"');
    expect(source).toContain("Issue profile details collected");
    expect(source).toContain("maxParticles = 40");
    expect(source).toContain("--burst-lift-y");
    expect(source).toContain("--burst-fall-y");
    expect(source).toContain('className="issue-profile-burst-spark"');
    expect(source).not.toContain("playedBurstKeysRef");
    expect(source).toContain("setActiveBurstKey(null)");
    expect(source).toContain("activeBurstKey ? (");
    expect(source).toContain("hiddenItemCount");
    expect(source).toContain("more issue profile detail types collected");
    expect(source).not.toContain('aria-label="Issue profile details collected"');
    expect(styles).toContain(".issue-profile-emoji-burst");
    expect(styles).toContain(".issue-profile-burst-spark");
    expect(styles).toContain("@keyframes issue-profile-emoji-burst");
    expect(styles).toContain("@keyframes issue-profile-burst-spark");
    expect(styles).toContain("2300ms");
    expect(styles).toContain("var(--burst-fall-y)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".issue-profile-emoji-burst {\n    display: none;");
  });

  it("uses distinct complete-empty copy for submitted attempts with no profile details", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('status === "complete_empty"');
    expect(source).toContain("Assessment submitted");
    expect(source).toContain("No profile details were identified");
  });

  it("styles the issue profile fill as a cool-to-warm gradient ending at red", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const fillStyles = styles.slice(styles.indexOf(".issue-profile-thermometer-fill"));

    expect(fillStyles).toContain("linear-gradient");
    expect(fillStyles).toContain("var(--info) 0%");
    expect(fillStyles).toContain("var(--teal) 28%");
    expect(fillStyles).toContain("var(--accent) 54%");
    expect(fillStyles).toContain("var(--warn) 78%");
    expect(fillStyles).toContain("var(--danger) 100%");
  });

  it("uses raw server fill during normal progress so answer changes can reduce the thermometer", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("issueProfileHighWaterByAttemptId");
    expect(source).not.toContain("Math.max(currentFill");
    expect(source).toContain(": activeSurvey.issueProfileProgress.fillPercent");
    expect(source).toContain("aria-valuenow={safeDisplayFillPercent}");
  });

  it("can show a complete profile on the ready-to-submit screen before final submission", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("function getIssueProfileDisplayFillPercent");
    expect(source).toContain("function isIssueProfileReadyToSubmit");
    expect(source).toContain("activeSurvey.currentPage === null");
    expect(source).toContain('activeSurvey.attempt.status !== "completed"');
    expect(source).toContain("activeSurvey.issueProfileProgress.identifiedCategoryCount > 0");
    expect(source).toContain("? 100");
    expect(source).toContain("Review and submit when ready");
  });

  it("keeps issue profile participant copy abstract and non-scoring", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");
    const issueProfileSource = source.slice(source.indexOf("function IssueProfileThermometer"));

    expect(issueProfileSource).not.toMatch(/hidden tag|tagKey|tagValue|violation count|score|severity/i);
    expect(issueProfileSource).not.toContain("identifiedCategoryCount");
    expect(issueProfileSource).not.toContain("encounteredCategoryCount");
  });

  it("uses native radio options for scale questions instead of a range slider", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="scale-answer-option"');
    expect(source).toContain('type="radio"');
    expect(source).not.toContain('type="range"');
  });

  it("keeps scale save behavior on the selected answer option id", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onChange={() => onSelect(option.id)}");
    expect(source).toContain(
      "onSelect={(optionId) => onSelectionChange(currentQuestion, optionId, true)}"
    );
  });

  it("announces required unanswered scale validation as a question error", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('setError("Choose a value on the scale")');
    expect(source).toContain("setErrorQuestionId(question.id)");
    expect(source).toContain('id={questionIds.errorId} role="alert"');
  });

  it("associates question controls with prompts, descriptions, and errors", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("getQuestionAccessibilityIds");
    expect(source).toContain("aria-describedby={describedBy}");
    expect(source).toContain("aria-labelledby={accessibilityIds.promptId}");
    expect(source).toContain('role="alert"');
  });
});
