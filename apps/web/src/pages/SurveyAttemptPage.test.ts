import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("SurveyAttemptPage participant accessibility", () => {
  it("renders semantic progress for the current survey path", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("<progress");
    expect(source).toContain('aria-label="Survey progress"');
    expect(source).toContain("on your current survey path");
    expect(source).not.toMatch(/Question\s*\{[^}]+\}\s*of\s*\{[^}]+\}/);
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
