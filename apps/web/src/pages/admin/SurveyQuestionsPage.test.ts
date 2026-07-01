import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { allTagValueOption } from "../../components/admin/SurveyBuilderComponents.js";

const questionsSource = readFileSync(new URL("./SurveyQuestionsPage.tsx", import.meta.url), "utf8");
const builderSource = readFileSync(
  new URL("../../components/admin/SurveyBuilderComponents.tsx", import.meta.url),
  "utf8"
);

describe("SurveyQuestionsPage hidden tag all helper", () => {
  it("offers a virtual all value for hidden tag add forms and creates subscriptions", () => {
    expect(allTagValueOption).toBe("__all_tag_values__");
    expect(builderSource).toContain("<option value={allTagValueOption}>{\"<ALL>\"}</option>");
    expect(builderSource).toContain("allowAllValue");
    expect(questionsSource).toContain("createAnswerTagAllBinding");
    expect(questionsSource).toContain("createQuestionOtherTagAllBinding");
    expect(questionsSource).toContain("createQuestionValueTagAllBinding");
    expect(questionsSource).toContain("deleteAnswerTagAllBinding");
    expect(questionsSource).toContain("tagValue === allTagValueOption");
    expect(builderSource).toContain("Managed by &lt;ALL&gt;");
  });
});
