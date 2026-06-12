import type {
  AnswerOption,
  ConditionalLogicRule,
  Survey,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyStatus
} from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

export const questionTypes: SurveyQuestionType[] = [
  "text",
  "integer",
  "single_select",
  "multi_select",
  "scale"
];

const customTagOptionValue = "__custom_tag_value__";

export interface TagPreset {
  tagKey: string;
  tagValue: string;
  source: "default" | "survey" | "custom";
}

export function SurveyEditStateBanner({ survey }: { survey: Survey }) {
  if (survey.status === "draft") {
    return (
      <div className="builder-state-banner draft">
        <strong>Draft survey</strong>
        <span>
          All builder controls are editable. Publish only after questions, options, and
          jump rules are ready for users.
        </span>
      </div>
    );
  }

  if (survey.status === "published") {
    return (
      <div className="builder-state-banner locked">
        <strong>Published survey</strong>
        <span>
          Users can access this survey. Questions, options, tags, and rules are locked to
          protect existing responses — create an editable draft copy to make structural
          changes. Title, description, and category stay editable.
        </span>
      </div>
    );
  }

  return (
    <div className="builder-state-banner retired">
      <strong>Retired survey</strong>
      <span>
        New starts are paused. The structure stays locked — create an editable draft copy
        to make changes, or republish if the survey should become available again.
      </span>
    </div>
  );
}

export function StatusActionPanel({
  isSubmitting,
  onStatusChange,
  survey
}: {
  isSubmitting: boolean;
  onStatusChange: (status: SurveyStatus) => Promise<void>;
  survey: Survey;
}) {
  const isDraft = survey.status === "draft";
  const isPublished = survey.status === "published";
  const isRetired = survey.status === "retired";

  return (
    <section className="builder-form status-action-panel">
      <div className="builder-section-heading">
        <div>
          <p className="eyebrow">Survey status</p>
          <h3>Availability</h3>
          <p className="builder-heading-note">
            {isDraft
              ? "This survey is saved as a draft. Publish when required questions, options, and rules are ready."
              : isPublished
                ? "This survey is live for users. Retire it to stop new starts while preserving existing attempts."
                : "This survey is retired and unavailable for new starts. Republish it when it passes validation."}
          </p>
        </div>
        <span className={`status-pill ${survey.status}`}>{survey.status}</span>
      </div>

      <div className="status-action-row">
        <span className="status-summary">
          Current status: <strong>{survey.status}</strong>
        </span>
        <div className="inline-actions">
          <button
            className="button-link compact-button primary-button"
            disabled={isSubmitting || (!isDraft && !isRetired)}
            onClick={() => void onStatusChange("published")}
            type="button"
          >
            {isRetired ? "Republish survey" : "Publish survey"}
          </button>
          <button
            className="button-link compact-button danger-button"
            disabled={isSubmitting || !isPublished}
            onClick={() => void onStatusChange("retired")}
            type="button"
          >
            Retire survey
          </button>
        </div>
      </div>
    </section>
  );
}

export function QuestionEditor({
  isFirst,
  isLast,
  isPublished,
  isSubmitting,
  onAddOption,
  onAddTag,
  onDeleteOption,
  onDeleteQuestion,
  onDeleteTag,
  onMoveOption,
  onMoveQuestion,
  onSaveOption,
  onSaveQuestion,
  onSaveTag,
  question,
  tagPresets
}: {
  isFirst: boolean;
  isLast: boolean;
  isPublished: boolean;
  isSubmitting: boolean;
  onAddOption: (event: FormEvent<HTMLFormElement>, question: SurveyQuestion) => Promise<void>;
  onAddTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption
  ) => Promise<void>;
  onDeleteOption: (question: SurveyQuestion, optionId: number) => Promise<void>;
  onDeleteQuestion: (questionId: number) => Promise<void>;
  onDeleteTag: (
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) => Promise<void>;
  onMoveOption: (
    question: SurveyQuestion,
    optionId: number,
    direction: -1 | 1
  ) => Promise<void>;
  onMoveQuestion: (questionId: number, direction: -1 | 1) => Promise<void>;
  onSaveOption: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption
  ) => Promise<void>;
  onSaveQuestion: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion
  ) => Promise<void>;
  onSaveTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) => Promise<void>;
  question: SurveyQuestion;
  tagPresets: TagPreset[];
}) {
  const [selectedQuestionType, setSelectedQuestionType] = useState(question.questionType);
  const isScale = selectedQuestionType === "scale";
  const isOptionBacked = isSelectionQuestion(question) || question.questionType === "scale";

  useEffect(() => {
    setSelectedQuestionType(question.questionType);
  }, [question.id, question.questionType]);

  return (
    <section className="question-editor">
      <form onSubmit={(event) => void onSaveQuestion(event, question)}>
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Question {question.displayOrder}</p>
            <h3>{question.questionText}</h3>
            <QuestionMetaStrip isPublished={isPublished} question={question} />
          </div>
          <div className="inline-actions">
            <button
              className="button-link compact-button ghost-button"
              disabled={isSubmitting || isPublished || isFirst}
              onClick={() => void onMoveQuestion(question.id, -1)}
              type="button"
            >
              Up
            </button>
            <button
              className="button-link compact-button ghost-button"
              disabled={isSubmitting || isPublished || isLast}
              onClick={() => void onMoveQuestion(question.id, 1)}
              type="button"
            >
              Down
            </button>
          </div>
        </div>

        <div className="builder-grid two-columns">
          <label>
            Question text
            <input defaultValue={question.questionText} name="questionText" required />
          </label>
          <label>
            Type
            <select
              defaultValue={question.questionType}
              disabled={isPublished}
              name={isPublished ? undefined : "questionType"}
              onChange={(event) =>
                setSelectedQuestionType(event.target.value as SurveyQuestionType)
              }
            >
              {questionTypes.map((type) => (
                <option key={type} value={type}>
                  {formatQuestionType(type)}
                </option>
              ))}
            </select>
            {isPublished ? (
              <input name="questionType" type="hidden" value={question.questionType} />
            ) : null}
          </label>
        </div>
        {isScale ? (
          <ScaleRangeFields
            disabled={isPublished}
            scaleMax={question.scaleMax ?? 10}
            scaleMin={question.scaleMin ?? 0}
          />
        ) : null}
        <label>
          Help text
          <input defaultValue={question.helpText ?? ""} name="helpText" />
        </label>
        <label className="checkbox-label">
          <input defaultChecked={question.isRequired} name="isRequired" type="checkbox" />
          Required
        </label>
        <div className="inline-actions">
          <button
            className="button-link compact-button primary-button"
            disabled={isSubmitting || isPublished}
            type="submit"
          >
            Save question
          </button>
          <button
            className="button-link compact-button danger-button"
            disabled={isSubmitting || isPublished}
            onClick={() => void onDeleteQuestion(question.id)}
            type="button"
          >
            Delete question
          </button>
        </div>
      </form>

      {isOptionBacked ? (
        <div className="option-editor">
          <div>
            <h4>{question.questionType === "scale" ? "Scale values" : "Answer options"}</h4>
            <p className="builder-heading-note">
              {question.questionType === "scale"
                ? "Scale values are generated from the range. Hidden tags are saved per value."
                : "Option text, order, and hidden tags are saved with separate actions."}
            </p>
          </div>
          {question.answerOptions.length === 0 ? (
            <div className="builder-empty-state compact">
              <strong>
                {question.questionType === "scale" ? "No scale values yet" : "No answer options yet"}
              </strong>
              <span>
                {question.questionType === "scale"
                  ? "Save a valid range on this question to generate selectable values."
                  : "Add at least one option below so users have choices and this question can drive hidden tags or jump rules."}
              </span>
            </div>
          ) : null}
          {question.answerOptions.map((option, index) => (
            <div className="option-editor-row" key={option.id}>
              <div className="option-row-header">
                <div>
                  <p className="option-subheading">
                    {question.questionType === "scale" ? "Scale value" : `Option ${index + 1}`}
                  </p>
                  <h5>{option.optionText}</h5>
                </div>
                {question.questionType !== "scale" ? (
                  <div className="inline-actions">
                    <button
                      className="button-link compact-button ghost-button"
                      disabled={isSubmitting || isPublished || index === 0}
                      onClick={() => void onMoveOption(question, option.id, -1)}
                      type="button"
                    >
                      Move up
                    </button>
                    <button
                      className="button-link compact-button ghost-button"
                      disabled={
                        isSubmitting || isPublished || index === question.answerOptions.length - 1
                      }
                      onClick={() => void onMoveOption(question, option.id, 1)}
                      type="button"
                    >
                      Move down
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="option-row-body">
                {question.questionType === "scale" ? (
                  <div className="scale-value-summary">
                    <span>Value shown to users</span>
                    <strong>{option.optionText}</strong>
                  </div>
                ) : (
                  <form
                    className="option-row-form"
                    onSubmit={(event) => void onSaveOption(event, question, option)}
                  >
                    <label>
                      Option text
                      <input defaultValue={option.optionText} name="optionText" required />
                    </label>
                    <div className="inline-actions">
                      <button
                        className="button-link compact-button primary-button"
                        disabled={isSubmitting || isPublished}
                        type="submit"
                      >
                        Save option text
                      </button>
                      <button
                        className="button-link compact-button danger-button"
                        disabled={isSubmitting || isPublished}
                        onClick={() => void onDeleteOption(question, option.id)}
                        type="button"
                      >
                        Delete option
                      </button>
                    </div>
                  </form>
                )}

                <div className="tag-editor">
                  <div>
                    <p className="option-subheading">
                      Hidden tags for this {question.questionType === "scale" ? "value" : "option"}
                    </p>
                    <p className="tag-helper-text">
                      {question.questionType === "scale"
                        ? "Tags attach when this value is selected."
                        : "Use Add hidden tag for new tags. Save option text does not save tag fields."}
                    </p>
                  </div>
                  {(option.answerTags ?? []).map((tag) => (
                    <form
                      className="tag-row"
                      key={tag.id}
                      onSubmit={(event) => void onSaveTag(event, question, option, tag.id)}
                    >
                      <TagFields
                        existingTags={(option.answerTags ?? [])
                          .filter((item) => item.id !== tag.id)
                          .map((item) => ({ tagKey: item.tagKey, tagValue: item.tagValue }))}
                        initialTagKey={tag.tagKey}
                        initialTagValue={tag.tagValue}
                        tagPresets={tagPresets}
                      />
                      <button
                        className="button-link compact-button secondary-button"
                        disabled={isSubmitting || isPublished}
                        type="submit"
                      >
                        Save tag
                      </button>
                      <button
                        className="button-link compact-button danger-button"
                        disabled={isSubmitting || isPublished}
                        onClick={() => void onDeleteTag(question, option, tag.id)}
                        type="button"
                      >
                        Remove tag
                      </button>
                    </form>
                  ))}
                  <form
                    className="tag-row add-tag-row"
                    key={`add-tag-${option.id}-${option.answerTags?.length ?? 0}`}
                    onSubmit={(event) => void onAddTag(event, question, option)}
                  >
                    <TagFields
                      existingTags={(option.answerTags ?? []).map((item) => ({
                        tagKey: item.tagKey,
                        tagValue: item.tagValue
                      }))}
                      tagPresets={tagPresets}
                    />
                    <button
                      className="button-link compact-button primary-button"
                      disabled={isSubmitting || isPublished}
                      type="submit"
                    >
                      Add hidden tag
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}

          {question.questionType !== "scale" ? (
            <form className="add-option-form" onSubmit={(event) => void onAddOption(event, question)}>
              <label>
                New option text
                <input disabled={isPublished} name="optionText" required />
              </label>
              <button
                className="button-link compact-button primary-button"
                disabled={isSubmitting || isPublished}
                type="submit"
              >
                Add option
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function QuestionMetaStrip({
  isPublished,
  question
}: {
  isPublished: boolean;
  question: SurveyQuestion;
}) {
  return (
    <div className="question-meta-strip" aria-label={`Question ${question.displayOrder} details`}>
      <span>{formatQuestionType(question.questionType)}</span>
      <span>{question.isRequired ? "Required" : "Optional"}</span>
      {isSelectionQuestion(question) ? (
        <span>{formatCount(question.answerOptions.length, "option")}</span>
      ) : null}
      {question.questionType === "scale" ? (
        <span>{formatCount(question.answerOptions.length, "value")}</span>
      ) : null}
      {isPublished ? <span>Structure locked</span> : <span>Editable draft</span>}
    </div>
  );
}

export function ScaleRangeFields({
  disabled = false,
  scaleMax = 10,
  scaleMin = 0
}: {
  disabled?: boolean;
  scaleMax?: number;
  scaleMin?: number;
}) {
  return (
    <div className="builder-grid two-columns scale-range-fields">
      <label>
        Minimum scale value
        <input
          defaultValue={scaleMin}
          disabled={disabled}
          name={disabled ? undefined : "scaleMin"}
          required
          step={1}
          type="number"
        />
        {disabled ? <input name="scaleMin" type="hidden" value={scaleMin} /> : null}
      </label>
      <label>
        Maximum scale value
        <input
          defaultValue={scaleMax}
          disabled={disabled}
          name={disabled ? undefined : "scaleMax"}
          required
          step={1}
          type="number"
        />
        {disabled ? <input name="scaleMax" type="hidden" value={scaleMax} /> : null}
      </label>
    </div>
  );
}

export function SurveyPreviewPanel({ survey }: { survey: Survey }) {
  const orderedQuestions = [...survey.questions].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );

  return (
    <section className="builder-form preview-panel" id="survey-preview">
      <div className="builder-section-heading">
        <div>
          <p className="eyebrow">Read-only preview</p>
          <h3>User survey preview</h3>
          <p className="builder-heading-note">
            Preview shows configured question order. Conditional jumps still depend on
            user answers during completion.
          </p>
        </div>
        <span className={`status-pill ${survey.status}`}>{survey.status}</span>
      </div>

      <div className="preview-surface" aria-label={`Preview of ${survey.title}`}>
        <div className="preview-intro">
          <p className="eyebrow">Survey</p>
          <h4>{survey.title}</h4>
          {survey.description ? <p>{survey.description}</p> : null}
        </div>

        {orderedQuestions.length === 0 ? (
          <div className="builder-empty-state compact">
            <strong>No questions to preview</strong>
            <span>Add questions above to see how this survey will read for users.</span>
          </div>
        ) : null}

        <div className="preview-question-list">
          {orderedQuestions.map((question) => (
            <article className="preview-question" key={question.id}>
              <div className="preview-question-heading">
                <p className="option-subheading">Question {question.displayOrder}</p>
                <span>{question.isRequired ? "Required" : "Optional"}</span>
              </div>
              <h5>{question.questionText}</h5>
              {question.helpText ? <p className="preview-help-text">{question.helpText}</p> : null}
              <PreviewQuestionControl question={question} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewQuestionControl({ question }: { question: SurveyQuestion }) {
  if (question.questionType === "text") {
    return <div className="preview-input">Text response</div>;
  }

  if (question.questionType === "integer") {
    return <div className="preview-input">Whole number response</div>;
  }

  if (question.questionType === "scale") {
    if (question.answerOptions.length === 0) {
      return (
        <div className="builder-empty-state compact">
          <strong>No scale values</strong>
          <span>Save a valid range before publishing this scale question.</span>
        </div>
      );
    }

    return (
      <div className="preview-scale-list">
        {sortAnswerOptions(question.answerOptions).map((option) => (
          <span className="preview-scale-value" key={option.id}>
            {option.optionText}
          </span>
        ))}
      </div>
    );
  }

  if (question.answerOptions.length === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>No answer options</strong>
        <span>Add options before publishing this selection question.</span>
      </div>
    );
  }

  return (
    <div className="preview-option-list">
      {sortAnswerOptions(question.answerOptions).map((option) => (
          <div className="preview-option-row" key={option.id}>
            <span aria-hidden="true">
              {question.questionType === "single_select" ? "( )" : "[ ]"}
            </span>
            <span>{option.optionText}</span>
          </div>
        ))}
    </div>
  );
}

function TagFields({
  existingTags = [],
  initialTagKey,
  initialTagValue,
  tagPresets
}: {
  existingTags?: { tagKey: string; tagValue: string }[];
  initialTagKey?: string;
  initialTagValue?: string;
  tagPresets: TagPreset[];
}) {
  const keyOptions = useMemo(
    () => uniqueValues([...tagPresets.map((preset) => preset.tagKey), initialTagKey]),
    [initialTagKey, tagPresets]
  );
  const initialKey = initialTagKey ?? "";
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [customKey, setCustomKey] = useState("");
  const [selectedValue, setSelectedValue] = useState(initialTagValue ?? "");
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (initialTagKey !== undefined || initialTagValue !== undefined) {
      setSelectedKey(initialTagKey ?? "");
      setCustomKey("");
      setSelectedValue(initialTagValue ?? "");
      setCustomValue("");
    }
  }, [initialTagKey, initialTagValue]);

  const isCustomKey = selectedKey === customTagOptionValue;
  const activeKey = isCustomKey ? customKey : selectedKey;
  const valueOptions = uniqueValues([
    ...tagPresets
      .filter((preset) => preset.tagKey === activeKey)
      .map((preset) => preset.tagValue),
    initialTagKey === activeKey ? initialTagValue : undefined
  ]);
  const isCustomValue = selectedValue === customTagOptionValue;
  const activeValue = isCustomKey || isCustomValue || valueOptions.length === 0 ? customValue : selectedValue;
  const isDuplicatePair = isDuplicateTagPair(existingTags, activeKey, activeValue);

  function handleKeyChange(nextKey: string) {
    setSelectedKey(nextKey);
    setCustomKey("");
    setSelectedValue("");
    setCustomValue("");
  }

  return (
    <>
      <label>
        Tag key
        <select
          name={isCustomKey ? undefined : "tagKey"}
          onChange={(event) => handleKeyChange(event.target.value)}
          required
          value={selectedKey}
        >
          <option value="">Choose tag key</option>
          {keyOptions.map((tagKey) => (
            <option key={tagKey} value={tagKey}>
              {tagKey}
            </option>
          ))}
          <option value={customTagOptionValue}>Custom key...</option>
        </select>
        {isCustomKey ? (
          <input
            autoComplete="off"
            name="tagKey"
            onChange={(event) => setCustomKey(event.target.value)}
            placeholder="Enter tag key"
            required
            value={customKey}
          />
        ) : null}
      </label>
      <label>
        Tag value
        {isCustomKey || isCustomValue || valueOptions.length === 0 ? (
          <input
            autoComplete="off"
            disabled={!activeKey.trim()}
            name="tagValue"
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="Enter tag value"
            required
            value={customValue}
          />
        ) : (
          <select
            disabled={!activeKey.trim()}
            name="tagValue"
            onChange={(event) => setSelectedValue(event.target.value)}
            required
            value={selectedValue}
          >
            <option value="">Choose tag value</option>
            {valueOptions.map((tagValue) => (
              <option key={tagValue} value={tagValue}>
                {tagValue}
              </option>
            ))}
            <option value={customTagOptionValue}>Custom value...</option>
          </select>
        )}
      </label>
      {isDuplicatePair ? (
        <p className="tag-duplicate-warning" role="alert">
          This key/value pair already exists on this option.
        </p>
      ) : null}
    </>
  );
}

function isDuplicateTagPair(
  existingTags: { tagKey: string; tagValue: string }[],
  tagKey: string,
  tagValue: string
): boolean {
  const normalizedKey = tagKey.trim().toLowerCase();
  const normalizedValue = tagValue.trim().toLowerCase();

  if (!normalizedKey || !normalizedValue) {
    return false;
  }

  return existingTags.some(
    (tag) =>
      tag.tagKey.trim().toLowerCase() === normalizedKey &&
      tag.tagValue.trim().toLowerCase() === normalizedValue
  );
}

export function RuleEditor({
  isSubmitting,
  onDeleteRule,
  onSaveRule,
  rule,
  survey
}: {
  isSubmitting: boolean;
  onDeleteRule: (ruleId: number) => Promise<void>;
  onSaveRule: (
    event: FormEvent<HTMLFormElement>,
    rule: ConditionalLogicRule
  ) => Promise<void>;
  rule: ConditionalLogicRule;
  survey: Survey;
}) {
  const sourceQuestions = survey.questions.filter((question) => isSelectionQuestion(question));
  const [sourceQuestionId, setSourceQuestionId] = useState(rule.sourceQuestionId);
  const [actionType, setActionType] = useState(rule.actionType);

  useEffect(() => {
    setSourceQuestionId(rule.sourceQuestionId);
  }, [rule.sourceQuestionId]);

  useEffect(() => {
    setActionType(rule.actionType);
  }, [rule.actionType]);

  const isSkipRule = actionType === "HIDE_QUESTION";

  const sourceQuestion =
    sourceQuestions.find((question) => question.id === sourceQuestionId) ??
    sourceQuestions[0] ??
    null;
  const targetQuestions = sourceQuestion
    ? survey.questions.filter(
        (question) => question.displayOrder > sourceQuestion.displayOrder
      )
    : [];

  return (
    <form className="rule-form rule-row" onSubmit={(event) => void onSaveRule(event, rule)}>
      <label>
        Source question
        <select
          name="sourceQuestionId"
          onChange={(event) => setSourceQuestionId(Number(event.target.value))}
          value={sourceQuestion?.id ?? ""}
        >
          {sourceQuestions.map((question) => (
            <option key={question.id} value={question.id}>
              {question.displayOrder}. {question.questionText}
            </option>
          ))}
        </select>
      </label>
      <label>
        Source answer
        <select
          defaultValue={rule.sourceAnswerOptionId}
          key={sourceQuestion?.id ?? "source-answer"}
          name="sourceAnswerOptionId"
        >
          {sourceQuestion?.answerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.optionText}
            </option>
          ))}
        </select>
      </label>
      <label>
        Action
        <select
          name="actionType"
          onChange={(event) =>
            setActionType(
              event.target.value === "HIDE_QUESTION" ? "HIDE_QUESTION" : "JUMP_TO_QUESTION"
            )
          }
          value={isSkipRule ? "HIDE_QUESTION" : "JUMP_TO_QUESTION"}
        >
          <option value="JUMP_TO_QUESTION">Jump to question</option>
          <option value="HIDE_QUESTION">Skip question</option>
        </select>
      </label>
      <label>
        {isSkipRule ? "Question to skip" : "Target question"}
        <select
          defaultValue={rule.targetQuestionId ?? ""}
          key={sourceQuestion?.id ?? "target-question"}
          name="targetQuestionId"
        >
          {targetQuestions.map((question) => (
            <option key={question.id} value={question.id}>
              {question.displayOrder}. {question.questionText}
            </option>
          ))}
        </select>
      </label>
      {isSkipRule ? null : (
        <label className="checkbox-label rule-flow-toggle">
          <input
            defaultChecked={rule.skipTargetInNormalFlow}
            name="skipTargetInNormalFlow"
            type="checkbox"
          />
          Skip target in normal flow
        </label>
      )}
      <div className="inline-actions">
        <button
          className="button-link compact-button primary-button"
          disabled={isSubmitting}
          type="submit"
        >
          Save rule
        </button>
        <button
          className="button-link compact-button danger-button"
          disabled={isSubmitting}
          onClick={() => void onDeleteRule(rule.id)}
          type="button"
        >
          Delete rule
        </button>
      </div>
    </form>
  );
}

export function isSelectionQuestion(question: SurveyQuestion): boolean {
  return question.questionType === "single_select" || question.questionType === "multi_select";
}

export function formatQuestionType(type: SurveyQuestionType): string {
  return type.replace("_", " ");
}

function sortAnswerOptions(options: AnswerOption[]): AnswerOption[] {
  return [...options].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );
}

function formatCount(count: number, singularLabel: string): string {
  return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}
