import {
  getOrderedQuestions,
  type AnswerOption,
  type ConditionalLogicRule,
  type HiddenTagAllBinding,
  type ParticipantGlossaryEntry,
  type QuestionValueTag,
  type Survey,
  type SurveyQuestion,
  type SurveyQuestionType,
  type SurveyStatus
} from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { InlineGlossaryText } from "../InlineGlossaryText.js";

export const questionTypes: SurveyQuestionType[] = [
  "text",
  "integer",
  "single_select",
  "multi_select",
  "scale"
];

const customTagOptionValue = "__custom_tag_value__";
export const allTagValueOption = "__all_tag_values__";

export interface TagPreset {
  tagKey: string;
  tagValue: string;
  source: "survey" | "custom";
}

export function SurveyEditStateBanner({ survey }: { survey: Survey }) {
  if (survey.status === "draft") {
    return (
      <div className="builder-state-banner draft">
        <strong>Draft assessment</strong>
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
        <strong>Published assessment</strong>
        <span>
          Users can access this assessment. Questions, options, and rules are locked to
          protect existing responses, while hidden tags can still be maintained for
          reporting. Title, description, and category stay editable. Create an editable
          draft copy to make structural changes.
        </span>
      </div>
    );
  }

  return (
    <div className="builder-state-banner retired">
      <strong>Retired assessment</strong>
      <span>
        New starts are paused. The structure stays locked — create an editable draft copy
        to make changes, or republish if the assessment should become available again.
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
          <p className="eyebrow">Assessment status</p>
          <h3>Availability</h3>
          <p className="builder-heading-note">
            {isDraft
              ? "This assessment is saved as a draft. Publish when required questions, options, and rules are ready."
              : isPublished
                ? "This assessment is live for users. Retire it to stop new starts while preserving existing attempts."
                : "This assessment is retired and unavailable for new starts. Republish it when it passes validation."}
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
            {isRetired ? "Republish assessment" : "Publish assessment"}
          </button>
          <button
            className="button-link compact-button danger-button"
            disabled={isSubmitting || !isPublished}
            onClick={() => void onStatusChange("retired")}
            type="button"
          >
            Retire assessment
          </button>
        </div>
      </div>
    </section>
  );
}

export function QuestionEditor({
  canEditTags,
  isFirst,
  isLast,
  isPublished,
  isSubmitting,
  isTemplateSaving = false,
  onAddOption,
  onAddOtherTag,
  onAddTag,
  onAddValueTag,
  onDeleteOtherTag,
  onDeleteOtherTagAllBinding,
  onDeleteOption,
  onDeleteQuestion,
  onDeleteTag,
  onDeleteTagAllBinding,
  onDeleteValueTag,
  onDeleteValueTagAllBinding,
  onMoveOption,
  onMoveQuestion,
  onSaveOption,
  onSaveOtherTag,
  onSaveQuestion,
  onSaveQuestionTemplate,
  onSaveTag,
  onSaveValueTag,
  question,
  questionLocator,
  tagPresets
}: {
  canEditTags: boolean;
  isFirst: boolean;
  isLast: boolean;
  isPublished: boolean;
  isSubmitting: boolean;
  isTemplateSaving?: boolean;
  onAddOption: (event: FormEvent<HTMLFormElement>, question: SurveyQuestion) => Promise<void>;
  onAddOtherTag: (event: FormEvent<HTMLFormElement>, question: SurveyQuestion) => Promise<void>;
  onAddTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption
  ) => Promise<void>;
  onAddValueTag: (event: FormEvent<HTMLFormElement>, question: SurveyQuestion) => Promise<void>;
  onDeleteOtherTag: (question: SurveyQuestion, tagId: number) => Promise<void>;
  onDeleteOtherTagAllBinding: (
    question: SurveyQuestion,
    binding: HiddenTagAllBinding
  ) => Promise<void>;
  onDeleteValueTag: (question: SurveyQuestion, valueTagId: number) => Promise<void>;
  onDeleteValueTagAllBinding: (
    question: SurveyQuestion,
    binding: HiddenTagAllBinding
  ) => Promise<void>;
  onDeleteOption: (question: SurveyQuestion, optionId: number) => Promise<void>;
  onDeleteQuestion: (questionId: number) => Promise<void>;
  onDeleteTag: (
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) => Promise<void>;
  onDeleteTagAllBinding: (
    question: SurveyQuestion,
    option: AnswerOption,
    binding: HiddenTagAllBinding
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
  onSaveOtherTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    tagId: number
  ) => Promise<void>;
  onSaveQuestion: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion
  ) => Promise<void>;
  onSaveQuestionTemplate?: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion
  ) => Promise<void>;
  onSaveTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) => Promise<void>;
  onSaveValueTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    valueTagId: number
  ) => Promise<void>;
  question: SurveyQuestion;
  questionLocator: string;
  tagPresets: TagPreset[];
}) {
  const [selectedQuestionType, setSelectedQuestionType] = useState(question.questionType);
  const isScale = selectedQuestionType === "scale";
  const supportsOther = selectedQuestionType === "single_select" || selectedQuestionType === "multi_select";
  const isOptionBacked = isSelectionQuestion(question) || question.questionType === "scale";
  const areTagsLocked = !canEditTags;
  const valueTagCount = (question.valueTags?.length ?? 0) + (question.valueTagAllBindings?.length ?? 0);
  const optionTagCount = question.answerOptions.reduce(
    (count, option) =>
      count + (option.answerTags?.length ?? 0) + (option.answerTagAllBindings?.length ?? 0),
    0
  );
  const otherTagCount = (question.otherTags?.length ?? 0) + (question.otherTagAllBindings?.length ?? 0);

  useEffect(() => {
    setSelectedQuestionType(question.questionType);
  }, [question.id, question.questionType]);

  return (
    <section className="question-editor">
      <div className="builder-section-heading question-editor-heading">
        <div>
          <p className="eyebrow">{questionLocator}</p>
          <h3>{question.questionText}</h3>
          <QuestionMetaStrip
            isPublished={isPublished}
            question={question}
            questionLocator={questionLocator}
          />
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

      <QuestionEditorSection defaultOpen title="Question details">
        <form
          className="question-details-form"
          onSubmit={(event) => void onSaveQuestion(event, question)}
        >
          <div className="builder-grid two-columns">
            <label>
              Question text
              <input
                defaultValue={question.questionText}
                disabled={isPublished}
                name="questionText"
                required
              />
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
            <input defaultValue={question.helpText ?? ""} disabled={isPublished} name="helpText" />
          </label>
          <label className="checkbox-label">
            <input
              defaultChecked={question.isRequired}
              disabled={isPublished}
              name="isRequired"
              type="checkbox"
            />
            Required
          </label>
          {supportsOther ? (
            <label className="checkbox-label">
              <input
                defaultChecked={
                  question.allowOther &&
                  (question.questionType === "single_select" ||
                    question.questionType === "multi_select")
                }
                disabled={isPublished}
                name="allowOther"
                type="checkbox"
              />
              Allow Other
            </label>
          ) : null}
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
      </QuestionEditorSection>

      {onSaveQuestionTemplate ? (
        <QuestionEditorSection
          key={`question-template-${question.id}`}
          title="Save as question template"
        >
          <form
            className="option-editor"
            onSubmit={(event) => void onSaveQuestionTemplate(event, question)}
          >
            <p className="builder-heading-note">
              Saves this question, answer options, scale range, and hidden tags. Conditional
              rules are recorded as warnings and are not copied.
            </p>
            <div className="builder-grid two-columns">
              <label>
                Template name
                <input
                  defaultValue={question.questionText}
                  disabled={isSubmitting || isTemplateSaving || isPublished}
                  name="name"
                  required
                />
              </label>
              <label>
                Inserted question text
                <input
                  defaultValue={question.questionText}
                  disabled={isSubmitting || isTemplateSaving || isPublished}
                  name="questionText"
                  required
                />
              </label>
              <label>
                Template note
                <input
                  disabled={isSubmitting || isTemplateSaving || isPublished}
                  name="description"
                  placeholder="Optional note for admins"
                />
              </label>
            </div>
            <button
              className="button-link compact-button secondary-button"
              disabled={isSubmitting || isTemplateSaving || isPublished}
              type="submit"
            >
              Save question template
            </button>
          </form>
        </QuestionEditorSection>
      ) : null}

      {question.questionType === "text" || question.questionType === "integer" ? (
        <QuestionEditorSection title={`Hidden tags for answers (${valueTagCount})`}>
          <div className="option-editor value-tag-editor">
            <p className="builder-heading-note">
              {question.questionType === "integer"
                ? "Tag respondents based on the number they enter. Bounds are inclusive; leave both blank to tag any answered value."
                : "Tags apply whenever the respondent gives a non-blank answer."}
            </p>

          {(question.valueTagAllBindings ?? []).map((binding) => (
            <HiddenTagAllBindingRow
              binding={binding}
              disabled={areTagsLocked}
              isSubmitting={isSubmitting}
              key={binding.id}
              onStop={() => void onDeleteValueTagAllBinding(question, binding)}
              questionType={question.questionType}
            />
          ))}

          {(question.valueTags ?? []).map((valueTag) => (
            <form
              className="builder-grid value-tag-form"
              key={valueTag.id}
              onSubmit={(event) => void onSaveValueTag(event, question, valueTag.id)}
            >
              {(() => {
                const isInheritedOnly = valueTag.isManual === false;

                return (
                  <>
              <TagFields
                allowAllValue
                disabled={areTagsLocked || isInheritedOnly}
                existingTags={(question.valueTags ?? [])
                  .filter((item) => item.id !== valueTag.id)
                  .map((item) => ({ tagKey: item.tagKey, tagValue: item.tagValue }))}
                initialTagKey={valueTag.tagKey}
                initialTagValue={valueTag.tagValue}
                tagPresets={tagPresets}
              />
              {question.questionType === "integer" ? (
                <>
                  <label>
                    Min value (optional)
                    <input
                      autoComplete="off"
                      defaultValue={valueTag.integerMin ?? ""}
                      disabled={areTagsLocked || isInheritedOnly}
                      inputMode="numeric"
                      name="integerMin"
                      type="number"
                    />
                  </label>
                  <label>
                    Max value (optional)
                    <input
                      autoComplete="off"
                      defaultValue={valueTag.integerMax ?? ""}
                      disabled={areTagsLocked || isInheritedOnly}
                      inputMode="numeric"
                      name="integerMax"
                      type="number"
                    />
                  </label>
                </>
              ) : (
                <span className="value-tag-condition">
                  {describeValueTagCondition(question.questionType, valueTag)}
                </span>
              )}
              <button
                className="button-link compact-button secondary-button"
                disabled={isSubmitting || areTagsLocked || isInheritedOnly}
                type="submit"
              >
                Save tag
              </button>
              {isInheritedOnly ? (
                <span className="tag-managed-note">Managed by &lt;ALL&gt;</span>
              ) : (
                <button
                  className="button-link compact-button danger-button"
                  disabled={isSubmitting || areTagsLocked}
                  onClick={() => void onDeleteValueTag(question, valueTag.id)}
                  type="button"
                >
                  Remove
                </button>
              )}
                  </>
                );
              })()}
            </form>
          ))}

          <form
            className="builder-grid value-tag-form"
            onSubmit={(event) => void onAddValueTag(event, question)}
          >
            <TagFields
              allowAllValue
              disabled={areTagsLocked}
              existingTags={question.valueTags ?? []}
              tagPresets={tagPresets}
            />
            {question.questionType === "integer" ? (
              <>
                <label>
                  Min value (optional)
                  <input
                    autoComplete="off"
                    disabled={areTagsLocked}
                    inputMode="numeric"
                    name="integerMin"
                    type="number"
                  />
                </label>
                <label>
                  Max value (optional)
                  <input
                    autoComplete="off"
                    disabled={areTagsLocked}
                    inputMode="numeric"
                    name="integerMax"
                    type="number"
                  />
                </label>
              </>
            ) : null}
            <div className="inline-actions">
              <button
                className="button-link compact-button primary-button"
                disabled={isSubmitting || areTagsLocked}
                type="submit"
              >
                Add hidden tag
              </button>
            </div>
          </form>
          </div>
        </QuestionEditorSection>
      ) : null}

      {isOptionBacked ? (
        <QuestionEditorSection
          title={
            question.questionType === "scale"
              ? `Scale values (${question.answerOptions.length})`
              : `Answer options (${question.answerOptions.length})`
          }
          meta={optionTagCount > 0 ? `${formatCount(optionTagCount, "hidden tag")}` : undefined}
        >
          <div className="option-editor">
            <p className="builder-heading-note">
              {question.questionType === "scale"
                ? "Scale values are generated from the range. Hidden tags are saved per value."
                : "Option text, order, and hidden tags are saved with separate actions."}
            </p>
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
                  {(option.answerTagAllBindings ?? []).map((binding) => (
                    <HiddenTagAllBindingRow
                      binding={binding}
                      disabled={areTagsLocked}
                      isSubmitting={isSubmitting}
                      key={binding.id}
                      onStop={() => void onDeleteTagAllBinding(question, option, binding)}
                    />
                  ))}
                  {(option.answerTags ?? []).map((tag) => (
                    <form
                      className="tag-row"
                      key={tag.id}
                      onSubmit={(event) => void onSaveTag(event, question, option, tag.id)}
                    >
                      {(() => {
                        const isInheritedOnly = tag.isManual === false;

                        return (
                          <>
                      <TagFields
                        allowAllValue
                        disabled={areTagsLocked || isInheritedOnly}
                        existingTags={(option.answerTags ?? [])
                          .filter((item) => item.id !== tag.id)
                          .map((item) => ({ tagKey: item.tagKey, tagValue: item.tagValue }))}
                        initialTagKey={tag.tagKey}
                        initialTagValue={tag.tagValue}
                        tagPresets={tagPresets}
                      />
                      <button
                        className="button-link compact-button secondary-button"
                        disabled={isSubmitting || areTagsLocked || isInheritedOnly}
                        type="submit"
                      >
                        Save tag
                      </button>
                      {isInheritedOnly ? (
                        <span className="tag-managed-note">Managed by &lt;ALL&gt;</span>
                      ) : (
                        <button
                          className="button-link compact-button danger-button"
                          disabled={isSubmitting || areTagsLocked}
                          onClick={() => void onDeleteTag(question, option, tag.id)}
                          type="button"
                        >
                          Remove tag
                        </button>
                      )}
                          </>
                        );
                      })()}
                    </form>
                  ))}
                  <form
                    className="tag-row add-tag-row"
                    key={`add-tag-${option.id}-${option.answerTags?.length ?? 0}`}
                    onSubmit={(event) => void onAddTag(event, question, option)}
                  >
                    <TagFields
                      allowAllValue
                      disabled={areTagsLocked}
                      existingTags={(option.answerTags ?? []).map((item) => ({
                        tagKey: item.tagKey,
                        tagValue: item.tagValue
                      }))}
                      tagPresets={tagPresets}
                    />
                    <button
                      className="button-link compact-button primary-button"
                      disabled={isSubmitting || areTagsLocked}
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
        </QuestionEditorSection>
      ) : null}

      {isSelectionQuestion(question) && question.allowOther ? (
        <QuestionEditorSection title={`Other tags (${otherTagCount})`}>
          <div className="option-editor">
            <p className="builder-heading-note">
              Tags apply when a respondent enters an Other answer. Other is not an answer option and cannot drive jump rules.
            </p>
          {(question.otherTagAllBindings ?? []).map((binding) => (
            <HiddenTagAllBindingRow
              binding={binding}
              disabled={areTagsLocked}
              isSubmitting={isSubmitting}
              key={binding.id}
              onStop={() => void onDeleteOtherTagAllBinding(question, binding)}
            />
          ))}
          {(question.otherTags ?? []).map((tag) => (
            <form
              className="tag-row"
              key={tag.id}
              onSubmit={(event) => void onSaveOtherTag(event, question, tag.id)}
            >
              {(() => {
                const isInheritedOnly = tag.isManual === false;

                return (
                  <>
              <TagFields
                allowAllValue
                disabled={areTagsLocked || isInheritedOnly}
                existingTags={(question.otherTags ?? [])
                  .filter((item) => item.id !== tag.id)
                  .map((item) => ({ tagKey: item.tagKey, tagValue: item.tagValue }))}
                initialTagKey={tag.tagKey}
                initialTagValue={tag.tagValue}
                tagPresets={tagPresets}
              />
              <button
                className="button-link compact-button secondary-button"
                disabled={isSubmitting || areTagsLocked || isInheritedOnly}
                type="submit"
              >
                Save tag
              </button>
              {isInheritedOnly ? (
                <span className="tag-managed-note">Managed by &lt;ALL&gt;</span>
              ) : (
                <button
                  className="button-link compact-button danger-button"
                  disabled={isSubmitting || areTagsLocked}
                  onClick={() => void onDeleteOtherTag(question, tag.id)}
                  type="button"
                >
                  Remove tag
                </button>
              )}
                  </>
                );
              })()}
            </form>
          ))}
          <form
            className="tag-row add-tag-row"
            key={`add-other-tag-${question.id}-${question.otherTags?.length ?? 0}`}
            onSubmit={(event) => void onAddOtherTag(event, question)}
          >
            <TagFields
              allowAllValue
              disabled={areTagsLocked}
              existingTags={(question.otherTags ?? []).map((item) => ({
                tagKey: item.tagKey,
                tagValue: item.tagValue
              }))}
              tagPresets={tagPresets}
            />
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting || areTagsLocked}
              type="submit"
            >
              Add hidden tag
            </button>
          </form>
          </div>
        </QuestionEditorSection>
      ) : null}
    </section>
  );
}

function QuestionEditorSection({
  children,
  defaultOpen = false,
  meta,
  title
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  meta?: string;
  title: string;
}) {
  // Keep the native details element controlled so local open state survives
  // rerenders while still resetting when the question editor remounts.
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="question-editor-section"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary>
        <span>{title}</span>
        {meta ? <em>{meta}</em> : null}
      </summary>
      <div className="question-editor-section-body">{children}</div>
    </details>
  );
}

function QuestionMetaStrip({
  isPublished,
  question,
  questionLocator
}: {
  isPublished: boolean;
  question: SurveyQuestion;
  questionLocator: string;
}) {
  return (
    <div className="question-meta-strip" aria-label={`${questionLocator} details`}>
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

export function SurveyPreviewPanel({
  glossaryEntries = [],
  survey
}: {
  glossaryEntries?: ParticipantGlossaryEntry[];
  survey: Survey;
}) {
  const orderedQuestions = getOrderedQuestions(survey);

  return (
    <section className="builder-form preview-panel" id="survey-preview">
      <div className="builder-section-heading">
        <div>
          <p className="eyebrow">Read-only preview</p>
          <h3>User assessment preview</h3>
          <p className="builder-heading-note">
            Preview shows configured question order. Conditional jumps still depend on
            user answers during completion.
          </p>
        </div>
        <span className={`status-pill ${survey.status}`}>{survey.status}</span>
      </div>

      <div className="preview-surface" aria-label={`Preview of ${survey.title}`}>
        <div className="preview-intro">
          <p className="eyebrow">Assessment</p>
          <h4>{survey.title}</h4>
          {survey.description ? <p>{survey.description}</p> : null}
        </div>

        {orderedQuestions.length === 0 ? (
          <div className="builder-empty-state compact">
            <strong>No questions to preview</strong>
            <span>Add questions above to see how this assessment will read for users.</span>
          </div>
        ) : null}

        <div className="preview-question-list">
          {orderedQuestions.map((question) => (
            <article className="preview-question" key={question.id}>
              <div className="preview-question-heading">
                <p className="option-subheading">{formatQuestionLocator(survey, question)}</p>
                <span>{question.isRequired ? "Required" : "Optional"}</span>
              </div>
              <h5>
                <InlineGlossaryText entries={glossaryEntries} text={question.questionText} />
              </h5>
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
      {question.allowOther ? (
        <div className="preview-option-row">
          <span aria-hidden="true">
            {question.questionType === "single_select" ? "( )" : "[ ]"}
          </span>
          <span>Other</span>
        </div>
      ) : null}
    </div>
  );
}

// Human-readable condition summary for a value tag row in the editor.
export function describeValueTagCondition(
  questionType: SurveyQuestionType,
  valueTag: Pick<QuestionValueTag, "integerMin" | "integerMax">
): string {
  if (questionType === "text") {
    return "any non-blank answer";
  }

  const { integerMin, integerMax } = valueTag;

  if (integerMin !== null && integerMax !== null) {
    return integerMin === integerMax ? `value = ${integerMin}` : `${integerMin} to ${integerMax}`;
  }

  if (integerMin !== null) {
    return `${integerMin} or more`;
  }

  if (integerMax !== null) {
    return `${integerMax} or fewer`;
  }

  return "any answered value";
}

function HiddenTagAllBindingRow({
  binding,
  disabled,
  isSubmitting,
  onStop,
  questionType
}: {
  binding: HiddenTagAllBinding;
  disabled: boolean;
  isSubmitting: boolean;
  onStop: () => void;
  questionType?: SurveyQuestionType;
}) {
  return (
    <div className="tag-row hidden-tag-all-row">
      <div className="hidden-tag-all-summary">
        <strong>{`<ALL>`}</strong>
        <span>Auto-applying all values in {binding.tagKey}</span>
        {questionType ? (
          <em>
            {describeValueTagCondition(questionType, {
              integerMin: binding.integerMin,
              integerMax: binding.integerMax
            })}
          </em>
        ) : null}
      </div>
      <button
        className="button-link compact-button danger-button"
        disabled={isSubmitting || disabled}
        onClick={onStop}
        type="button"
      >
        Stop
      </button>
    </div>
  );
}

function TagFields({
  allowAllValue = false,
  disabled = false,
  existingTags = [],
  initialTagKey,
  initialTagValue,
  tagPresets
}: {
  allowAllValue?: boolean;
  disabled?: boolean;
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
  const isAllValue = selectedValue === allTagValueOption;
  const activeValue = isCustomKey || isCustomValue || valueOptions.length === 0 ? customValue : selectedValue;
  const isDuplicatePair =
    !isAllValue && isDuplicateTagPair(existingTags, activeKey, activeValue);
  const shouldShowAllValueOption =
    allowAllValue && !isCustomKey && activeKey.trim() !== "" && valueOptions.length > 0;

  function handleKeyChange(nextKey: string) {
    setSelectedKey(nextKey);
    setCustomKey("");
    setSelectedValue("");
    setCustomValue("");
  }

  return (
    <>
      <label>
        Tag category
        <select
          disabled={disabled}
          name={isCustomKey ? undefined : "tagKey"}
          onChange={(event) => handleKeyChange(event.target.value)}
          required
          value={selectedKey}
        >
          <option value="">Choose tag category</option>
          {keyOptions.map((tagKey) => (
            <option key={tagKey} value={tagKey}>
              {tagKey}
            </option>
          ))}
          <option value={customTagOptionValue}>Custom category...</option>
        </select>
        {isCustomKey ? (
          <input
            autoComplete="off"
            disabled={disabled}
            name="tagKey"
            onChange={(event) => setCustomKey(event.target.value)}
            placeholder="Enter tag category"
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
            disabled={disabled || !activeKey.trim()}
            name="tagValue"
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="Enter tag value"
            required
            value={customValue}
          />
        ) : (
          <select
            disabled={disabled || !activeKey.trim()}
            name="tagValue"
            onChange={(event) => setSelectedValue(event.target.value)}
            required
            value={selectedValue}
          >
            <option value="">Choose tag value</option>
            {shouldShowAllValueOption ? <option value={allTagValueOption}>{"<ALL>"}</option> : null}
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
          This category/value pair already exists here.
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

// Maps an action <select> value to a runtime-executed action type, defaulting
// unrecognized values to the legacy jump-to-question action.
function toRuleActionType(value: string): ConditionalLogicRule["actionType"] {
  if (
    value === "HIDE_QUESTION" ||
    value === "HIDE_PAGE" ||
    value === "JUMP_TO_PAGE" ||
    value === "JUMP_TO_QUESTION"
  ) {
    return value;
  }

  return "JUMP_TO_QUESTION";
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
  const [actionType, setActionType] = useState(rule.actionType);
  const orderedQuestions = getOrderedQuestions(survey);
  const sourceQuestions = orderedQuestions.filter(
    (question) => isSelectionQuestion(question) || question.questionType === "text"
  );
  const [sourceQuestionId, setSourceQuestionId] = useState(rule.sourceQuestionId);

  useEffect(() => {
    setSourceQuestionId(rule.sourceQuestionId);
  }, [rule.sourceQuestionId]);

  useEffect(() => {
    setActionType(rule.actionType);
  }, [rule.actionType]);

  const isSkipRule = actionType === "HIDE_QUESTION";
  const isPageHideRule = actionType === "HIDE_PAGE";
  const isPageJumpRule = actionType === "JUMP_TO_PAGE";
  // Rules whose target is a page, and rules that never carry the static
  // normal-flow skip flag (both per-attempt skips).
  const isPageTargetRule = isPageJumpRule || isPageHideRule;
  const isAttemptSkipRule = isSkipRule || isPageHideRule;

  const sourceQuestion =
    sourceQuestions.find((question) => question.id === sourceQuestionId) ??
    sourceQuestions[0] ??
    null;
  const isBlankTextRule = sourceQuestion?.questionType === "text";
  const targetQuestions = sourceQuestion
    ? orderedQuestions.filter(
        (question) =>
          orderedQuestions.findIndex((item) => item.id === question.id) >
          orderedQuestions.findIndex((item) => item.id === sourceQuestion.id)
      )
    : [];
  const sourcePage = sourceQuestion
    ? survey.pages.find((page) => page.id === sourceQuestion.pageId) ?? null
    : null;
  const targetPages = sourcePage
    ? survey.pages.filter((page) => page.displayOrder > sourcePage.displayOrder)
    : [];

  return (
    <form className="rule-form rule-row" onSubmit={(event) => void onSaveRule(event, rule)}>
      <input name="sourcePageId" type="hidden" value={sourceQuestion?.pageId ?? ""} />
      <label>
        Source question
        <select
          name="sourceQuestionId"
          onChange={(event) => {
            const nextQuestionId = Number(event.target.value);
            const nextQuestion =
              sourceQuestions.find((question) => question.id === nextQuestionId) ?? null;

            setSourceQuestionId(nextQuestionId);
            if (nextQuestion?.questionType === "text") {
              setActionType("HIDE_QUESTION");
            }
          }}
          value={sourceQuestion?.id ?? ""}
        >
          {sourceQuestions.map((question) => (
            <option key={question.id} value={question.id}>
              {formatQuestionOptionLabel(survey, question)}
            </option>
          ))}
        </select>
      </label>
      {isBlankTextRule ? (
        <label>
          Condition
          <input readOnly value="Answer is blank" />
          <input name="conditionOperator" type="hidden" value="is_blank" />
        </label>
      ) : (
        <label>
          Source answer
          <select
            defaultValue={rule.sourceAnswerOptionId ?? ""}
            key={sourceQuestion?.id ?? "source-answer"}
            name="sourceAnswerOptionId"
          >
            {sourceQuestion?.answerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.optionText}
              </option>
            ))}
          </select>
          <input name="conditionOperator" type="hidden" value="equals" />
        </label>
      )}
      <label>
        Action
        {isBlankTextRule ? (
          <select
            name="actionType"
            onChange={(event) => {
              setActionType(event.target.value === "HIDE_PAGE" ? "HIDE_PAGE" : "HIDE_QUESTION");
            }}
            value={isPageHideRule ? "HIDE_PAGE" : "HIDE_QUESTION"}
          >
            <option value="HIDE_QUESTION">Skip question</option>
            <option value="HIDE_PAGE">Skip page</option>
          </select>
        ) : (
          <select
            name="actionType"
            onChange={(event) => {
              setActionType(toRuleActionType(event.target.value));
            }}
            value={actionType}
          >
            <option value="JUMP_TO_PAGE">Jump to page</option>
            <option value="JUMP_TO_QUESTION">Jump to question (legacy)</option>
            <option value="HIDE_QUESTION">Skip question</option>
            <option value="HIDE_PAGE">Skip page</option>
          </select>
        )}
      </label>
      {isPageTargetRule ? (
        <label>
          {isPageHideRule ? "Page to skip" : "Target page"}
          <select
            defaultValue={rule.targetPageId ?? ""}
            key={sourceQuestion?.id ?? "target-page"}
            name="targetPageId"
          >
            {targetPages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.displayOrder}. {page.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          {isSkipRule ? "Question to skip" : "Target question (lands on containing page)"}
          <select
            defaultValue={rule.targetQuestionId ?? ""}
            key={sourceQuestion?.id ?? "target-question"}
            name="targetQuestionId"
          >
            {targetQuestions.map((question) => (
              <option key={question.id} value={question.id}>
                {formatQuestionOptionLabel(survey, question)}
              </option>
            ))}
          </select>
        </label>
      )}
      {isPageHideRule ? (
        <label className="checkbox-label rule-flow-toggle">
          <input
            defaultChecked={rule.advanceOnTrigger}
            name="advanceOnTrigger"
            type="checkbox"
          />
          Advance immediately when triggered
        </label>
      ) : isAttemptSkipRule ? (
        // Occupies the normal-flow checkbox cell so Save/Delete land in the
        // same grid column for skip rules, which never carry the flag.
        <span aria-hidden="true" className="rule-flow-spacer" />
      ) : (
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

export function formatQuestionLocator(survey: Survey, question: SurveyQuestion): string {
  const page = survey.pages.find((candidate) => candidate.id === question.pageId);
  const pageOrder = page?.displayOrder ?? question.pageId;

  return `P${pageOrder}-Q${question.displayOrder}`;
}

export function formatQuestionOptionLabel(survey: Survey, question: SurveyQuestion): string {
  return `${formatQuestionLocator(survey, question)} ${question.questionText}`;
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
