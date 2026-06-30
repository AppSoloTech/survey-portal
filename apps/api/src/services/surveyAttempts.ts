import {
  calculateSurveyIssueProfileEmojiCollection,
  calculateSurveyIssueProfileProgress,
  getQuestionsForPage,
  resolveProgressivePageState,
  type AnswerSurveyResponse,
  type MySurveyResponse,
  type MySurveysResponse,
  type ParticipantGlossaryEntry,
  type StartSurveyResponse,
  type Survey,
  type SurveyAttempt,
  type SurveyIssueProfileEmojiCollection,
  type SurveyIssueProfileProgress,
  type SurveyPage,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "@survey-portal/shared";
import pg from "pg";

import { pool } from "../db.js";
import {
  mapSurveyAttemptRecord,
  mapSurveyResponseAnswerRecord,
  parseScaleOptionValue,
  type Queryable,
  type SelectedOptionRecord,
  type SurveyAttemptRecord,
  type SurveyQuestionRecord,
  type SurveyResponseAnswerRecord
} from "./surveyRecords.js";
import { fetchSurveyStructures } from "./surveyStructure.js";
import { fetchParticipantGlossaryEntries } from "./glossary.js";
import type {
  AnswerRequestValue,
  NormalizedAnswerValue,
  PageAnswerRequestValue,
  ValidationResult
} from "./validation.js";

const { DatabaseError } = pg;

export class AnonymousSurveyUnavailableError extends Error {
  constructor() {
    super("Anonymous survey link is unavailable");
  }
}

export async function insertSurveyAttemptOrFetchActive(
  surveyId: number,
  userId: number
): Promise<{ attemptId: number; created: boolean }> {
  try {
    const result = await pool.query<{ id: number }>(
      `insert into survey_attempts (
         survey_id,
         user_id,
         status,
         started_at,
         last_activity_at
       )
       values ($1, $2, 'in_progress', now(), now())
       returning id`,
      [surveyId, userId]
    );

    return {
      attemptId: result.rows[0].id,
      created: true
    };
  } catch (error) {
    if (!isActiveAttemptUniqueViolation(error)) {
      throw error;
    }

    const existingAttempt = await fetchActiveAttempt(userId, surveyId);

    if (!existingAttempt) {
      throw error;
    }

    return {
      attemptId: existingAttempt.id,
      created: false
    };
  }
}

export async function insertAnonymousSurveyAttempt(input: {
  surveyId: number;
  anonymousLinkId: number;
  accessTokenHash: string;
}): Promise<{ attemptId: number }> {
  const result = await pool.query<{ id: number }>(
    `insert into survey_attempts (
       survey_id,
       user_id,
       anonymous_link_id,
       anonymous_access_token_hash,
       anonymous_contact_email,
       status,
       started_at,
       last_activity_at
     )
     values ($1, null, $2, $3, null, 'in_progress', now(), now())
     returning id`,
    [input.surveyId, input.anonymousLinkId, input.accessTokenHash]
  );

  return { attemptId: result.rows[0].id };
}

export async function fetchActiveAttempt(
  userId: number,
  surveyId: number
): Promise<SurveyAttemptRecord | null> {
  const result = await pool.query<SurveyAttemptRecord>(
    `select
       id,
       survey_id,
       user_id,
       anonymous_link_id,
       anonymous_access_token_hash,
       anonymous_contact_email,
       status,
       started_at,
       last_activity_at,
       completed_at,
       created_at,
       updated_at
     from survey_attempts
     where user_id = $1
       and survey_id = $2
       and status in ('not_started', 'in_progress')
     order by updated_at desc, id desc
     limit 1`,
    [userId, surveyId]
  );

  return result.rows[0] ?? null;
}

// One attempt per user per survey: a completed attempt permanently blocks
// new starts. Abandoned attempts do not block a fresh start, matching the
// data-model decision that one active or completed attempt is the unit of
// record.
export async function fetchCompletedAttempt(
  userId: number,
  surveyId: number
): Promise<SurveyAttemptRecord | null> {
  const result = await pool.query<SurveyAttemptRecord>(
    `select
       id,
       survey_id,
       user_id,
       anonymous_link_id,
       anonymous_access_token_hash,
       anonymous_contact_email,
       status,
       started_at,
       last_activity_at,
       completed_at,
       created_at,
       updated_at
     from survey_attempts
     where user_id = $1
       and survey_id = $2
       and status = 'completed'
     order by updated_at desc, id desc
     limit 1`,
    [userId, surveyId]
  );

  return result.rows[0] ?? null;
}

export async function fetchAttemptForUser(
  queryable: Queryable,
  attemptId: number,
  userId: number,
  surveyId: number
): Promise<SurveyAttemptRecord | null> {
  const result = await queryable.query<SurveyAttemptRecord>(
    `select
       id,
       survey_id,
       user_id,
       anonymous_link_id,
       anonymous_access_token_hash,
       anonymous_contact_email,
       status,
       started_at,
       last_activity_at,
       completed_at,
       created_at,
       updated_at
     from survey_attempts
     where id = $1
       and user_id = $2
       and survey_id = $3`,
    [attemptId, userId, surveyId]
  );

  return result.rows[0] ?? null;
}

export async function fetchAttemptForAnonymousOwner(
  queryable: Queryable,
  attemptId: number,
  anonymousLinkId: number,
  accessTokenHash: string,
  surveyId: number
): Promise<SurveyAttemptRecord | null> {
  const result = await queryable.query<SurveyAttemptRecord>(
    `select
       id,
       survey_id,
       user_id,
       anonymous_link_id,
       anonymous_access_token_hash,
       status,
       started_at,
       last_activity_at,
       completed_at,
       created_at,
       updated_at
     from survey_attempts
     where id = $1
       and anonymous_link_id = $2
       and anonymous_access_token_hash = $3
       and survey_id = $4`,
    [attemptId, anonymousLinkId, accessTokenHash, surveyId]
  );

  return result.rows[0] ?? null;
}

export async function buildStartSurveyResponse(
  attemptId: number,
  userId: number
): Promise<StartSurveyResponse> {
  const detail = await buildAttemptDetail(attemptId, userId);

  return {
    attempt: detail.attempt,
    survey: detail.survey,
    glossaryEntries: detail.glossaryEntries,
    issueProfileProgress: detail.issueProfileProgress,
    issueProfileEmojiCollection: detail.issueProfileEmojiCollection,
    currentQuestion: detail.currentQuestion,
    currentPage: detail.currentPage,
    currentPageQuestionIds: detail.currentPageQuestionIds
  };
}

export async function buildStartAnonymousSurveyResponse(input: {
  attemptId: number;
  anonymousLinkId: number;
  accessToken: string;
  accessTokenHash: string;
}): Promise<StartSurveyResponse & { attemptAccessToken: string }> {
  const detail = await buildAnonymousAttemptDetail(
    input.attemptId,
    input.anonymousLinkId,
    input.accessTokenHash
  );

  return {
    attempt: detail.attempt,
    survey: detail.survey,
    glossaryEntries: detail.glossaryEntries,
    issueProfileProgress: detail.issueProfileProgress,
    issueProfileEmojiCollection: detail.issueProfileEmojiCollection,
    currentQuestion: detail.currentQuestion,
    currentPage: detail.currentPage,
    currentPageQuestionIds: detail.currentPageQuestionIds,
    attemptAccessToken: input.accessToken
  };
}

export async function buildAnswerSurveyResponse(
  attemptId: number,
  userId: number
): Promise<AnswerSurveyResponse> {
  const detail = await buildAttemptDetail(attemptId, userId);

  return {
    attempt: detail.attempt,
    issueProfileProgress: detail.issueProfileProgress,
    issueProfileEmojiCollection: detail.issueProfileEmojiCollection,
    currentQuestion: detail.currentQuestion,
    currentPage: detail.currentPage,
    currentPageQuestionIds: detail.currentPageQuestionIds,
    isCompleteReady: detail.currentPage === null
  };
}

export async function buildAnonymousAnswerSurveyResponse(
  attemptId: number,
  anonymousLinkId: number,
  accessTokenHash: string
): Promise<AnswerSurveyResponse> {
  const detail = await buildAnonymousAttemptDetail(attemptId, anonymousLinkId, accessTokenHash);

  return {
    attempt: detail.attempt,
    issueProfileProgress: detail.issueProfileProgress,
    issueProfileEmojiCollection: detail.issueProfileEmojiCollection,
    currentQuestion: detail.currentQuestion,
    currentPage: detail.currentPage,
    currentPageQuestionIds: detail.currentPageQuestionIds,
    isCompleteReady: detail.currentPage === null
  };
}

export async function buildMySurveyResponse(
  attemptId: number,
  userId: number
): Promise<MySurveyResponse | null> {
  const attempt = await fetchAttemptWithResponses(attemptId, userId);

  if (!attempt) {
    return null;
  }

  const [[survey], [issueProfileSurvey]] = await Promise.all([
    fetchSurveyStructures({
      surveyId: attempt.surveyId,
      includeAllStatuses: true,
      includeHiddenTags: false
    }),
    fetchSurveyStructures({
      surveyId: attempt.surveyId,
      includeAllStatuses: true,
      includeHiddenTags: true
    })
  ]);

  if (!survey || survey.status === "draft") {
    return null;
  }

  return {
    attempt,
    survey,
    glossaryEntries: await fetchParticipantGlossaryEntries(),
    issueProfileProgress: buildIssueProfileProgressFromSurvey(issueProfileSurvey ?? survey, attempt),
    issueProfileEmojiCollection: buildIssueProfileEmojiCollectionFromSurvey(
      issueProfileSurvey ?? survey,
      attempt
    ),
    ...determineProgressiveAttemptState(survey, attempt)
  };
}

export async function buildAttemptDetail(
  attemptId: number,
  userId: number
): Promise<{
  attempt: SurveyAttempt;
  survey: Survey;
  glossaryEntries: ParticipantGlossaryEntry[];
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}> {
  const response = await buildMySurveyResponse(attemptId, userId);

  if (!response) {
    throw new Error("Survey attempt not found");
  }

  return response;
}

export async function buildAnonymousAttemptDetail(
  attemptId: number,
  anonymousLinkId: number,
  accessTokenHash: string
): Promise<{
  attempt: SurveyAttempt;
  survey: Survey;
  glossaryEntries: ParticipantGlossaryEntry[];
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}> {
  const attempt = await fetchAnonymousAttemptWithResponses(
    attemptId,
    anonymousLinkId,
    accessTokenHash
  );

  if (!attempt) {
    throw new AnonymousSurveyUnavailableError();
  }

  const [[survey], [issueProfileSurvey]] = await Promise.all([
    fetchSurveyStructures({
      surveyId: attempt.surveyId,
      includeAllStatuses: true,
      includeHiddenTags: false
    }),
    fetchSurveyStructures({
      surveyId: attempt.surveyId,
      includeAllStatuses: true,
      includeHiddenTags: true
    })
  ]);

  if (!survey || survey.status !== "published" || survey.deletedAt) {
    throw new AnonymousSurveyUnavailableError();
  }

  return {
    attempt,
    survey,
    glossaryEntries: await fetchParticipantGlossaryEntries(),
    issueProfileProgress: buildIssueProfileProgressFromSurvey(issueProfileSurvey ?? survey, attempt),
    issueProfileEmojiCollection: buildIssueProfileEmojiCollectionFromSurvey(
      issueProfileSurvey ?? survey,
      attempt
    ),
    ...determineProgressiveAttemptState(survey, attempt)
  };
}

export async function buildIssueProfileProgress(
  attempt: SurveyAttempt
): Promise<SurveyIssueProfileProgress> {
  const [survey] = await fetchSurveyStructures({
    surveyId: attempt.surveyId,
    includeAllStatuses: true,
    includeHiddenTags: true
  });

  return buildIssueProfileProgressFromSurvey(survey, attempt);
}

export async function buildIssueProfileEmojiCollection(
  attempt: SurveyAttempt
): Promise<SurveyIssueProfileEmojiCollection> {
  const [survey] = await fetchSurveyStructures({
    surveyId: attempt.surveyId,
    includeAllStatuses: true,
    includeHiddenTags: true
  });

  return buildIssueProfileEmojiCollectionFromSurvey(survey, attempt);
}

function buildIssueProfileProgressFromSurvey(
  survey: Survey | undefined,
  attempt: SurveyAttempt
): SurveyIssueProfileProgress {
  if (!survey) {
    return {
      fillPercent: 0,
      identifiedCategoryCount: 0,
      encounteredCategoryCount: 0,
      status: attempt.status === "completed" ? "complete_empty" : "empty"
    };
  }

  return calculateSurveyIssueProfileProgress({
    attemptStatus: attempt.status,
    responses: attempt.responses,
    survey
  });
}

function buildIssueProfileEmojiCollectionFromSurvey(
  survey: Survey | undefined,
  attempt: SurveyAttempt
): SurveyIssueProfileEmojiCollection {
  if (!survey) {
    return {
      items: [],
      totalCount: 0
    };
  }

  return calculateSurveyIssueProfileEmojiCollection({
    responses: attempt.responses,
    survey
  });
}

export async function buildMySurveysResponse(userId: number): Promise<MySurveysResponse> {
  const surveyIdResult = await pool.query<{ id: number }>(
    `with survey_scope as (
       select id
       from surveys
       where status = 'published'
         and deleted_at is null
       union
       select surveys.id
       from survey_attempts
       join surveys on surveys.id = survey_attempts.survey_id
       where survey_attempts.user_id = $1
         and surveys.status <> 'draft'
         and surveys.deleted_at is null
     )
     select id
     from survey_scope
     order by id`,
    [userId]
  );
  const surveyIds = surveyIdResult.rows.map((row) => row.id);

  if (surveyIds.length === 0) {
    return { surveys: [] };
  }

  const surveys = await fetchSurveyStructures({
    surveyIds,
    includeAllStatuses: true,
    includeHiddenTags: false
  });
  const attempts = await fetchAttemptsForSurveyIds(userId, surveyIds);
  const attemptsBySurveyId = new Map<number, SurveyAttempt>();

  for (const attempt of attempts) {
    if (!attemptsBySurveyId.has(attempt.surveyId)) {
      attemptsBySurveyId.set(attempt.surveyId, attempt);
    }
  }

  return {
    surveys: surveys.map((survey) => ({
      survey,
      attempt: attemptsBySurveyId.get(survey.id) ?? null
    }))
  };
}

export async function fetchAttemptWithResponses(
  attemptId: number,
  userId: number,
  queryable: Queryable = pool
): Promise<SurveyAttempt | null> {
  const attempts = await fetchAttemptsByCondition(
    queryable,
    `survey_attempts.user_id = $1
       and survey_attempts.id = $2`,
    [userId, attemptId]
  );

  return attempts[0] ?? null;
}

export async function fetchAnonymousAttemptWithResponses(
  attemptId: number,
  anonymousLinkId: number,
  accessTokenHash: string
): Promise<SurveyAttempt | null> {
  const attempts = await fetchAttemptsByCondition(
    pool,
    `survey_attempts.id = $1
       and survey_attempts.anonymous_link_id = $2
       and survey_attempts.anonymous_access_token_hash = $3`,
    [attemptId, anonymousLinkId, accessTokenHash]
  );

  return attempts[0] ?? null;
}

export async function fetchAttemptsForSurveyIds(
  userId: number,
  surveyIds: number[]
): Promise<SurveyAttempt[]> {
  if (surveyIds.length === 0) {
    return [];
  }

  return fetchAttemptsByCondition(
    pool,
    `survey_attempts.user_id = $1
       and survey_attempts.survey_id = any($2::int[])`,
    [userId, surveyIds]
  );
}

async function fetchAttemptsByCondition(
  queryable: Queryable,
  condition: string,
  values: unknown[]
): Promise<SurveyAttempt[]> {
  const attemptsResult = await queryable.query<SurveyAttemptRecord>(
    `select
       survey_attempts.id,
       survey_attempts.survey_id,
       survey_attempts.user_id,
       survey_attempts.anonymous_link_id,
       survey_attempts.anonymous_access_token_hash,
       survey_attempts.anonymous_contact_email,
       survey_attempts.status,
       survey_attempts.started_at,
       survey_attempts.last_activity_at,
       survey_attempts.completed_at,
       survey_attempts.created_at,
       survey_attempts.updated_at
     from survey_attempts
     where ${condition}
     order by
       survey_attempts.survey_id,
       case
         when survey_attempts.status in ('not_started', 'in_progress') then 0
         else 1
       end,
       survey_attempts.updated_at desc,
       survey_attempts.id desc`,
    values
  );
  const attemptIds = attemptsResult.rows.map((attempt) => attempt.id);

  if (attemptIds.length === 0) {
    return [];
  }

  const responsesResult = await queryable.query<SurveyResponseAnswerRecord>(
    `select
       id,
       survey_attempt_id,
       question_id,
       answer_text,
       answer_integer,
       other_text,
       created_at,
       updated_at
     from survey_response_answers
     where survey_attempt_id = any($1::int[])
     order by id`,
    [attemptIds]
  );
  const responseIds = responsesResult.rows.map((response) => response.id);
  const selectedOptionsResult =
    responseIds.length > 0
      ? await queryable.query<SelectedOptionRecord>(
          `select
             survey_response_answer_id,
             answer_option_id
           from survey_response_selected_options
           where survey_response_answer_id = any($1::int[])
           order by survey_response_answer_id, answer_option_id`,
          [responseIds]
        )
      : { rows: [] as SelectedOptionRecord[] };
  const selectedOptionsByResponseId = new Map<number, number[]>();

  for (const selectedOption of selectedOptionsResult.rows) {
    const selectedIds =
      selectedOptionsByResponseId.get(selectedOption.survey_response_answer_id) ?? [];
    selectedIds.push(selectedOption.answer_option_id);
    selectedOptionsByResponseId.set(
      selectedOption.survey_response_answer_id,
      selectedIds
    );
  }

  const responsesByAttemptId = new Map<number, SurveyResponseAnswer[]>();

  for (const response of responsesResult.rows) {
    const mappedResponse = mapSurveyResponseAnswerRecord(
      response,
      selectedOptionsByResponseId.get(response.id) ?? []
    );
    const responses = responsesByAttemptId.get(response.survey_attempt_id) ?? [];
    responses.push(mappedResponse);
    responsesByAttemptId.set(response.survey_attempt_id, responses);
  }

  return attemptsResult.rows.map((attempt) =>
    mapSurveyAttemptRecord(attempt, responsesByAttemptId.get(attempt.id) ?? [])
  );
}

export async function validateAnswerForQuestion(
  queryable: Queryable,
  question: SurveyQuestionRecord,
  value: AnswerRequestValue
): Promise<ValidationResult<NormalizedAnswerValue>> {
  if (
    question.question_type !== "single_select" &&
    question.question_type !== "multi_select" &&
    (value.isOtherSelected || value.otherText)
  ) {
    return { ok: false, error: "Other is only supported for single-select and multi-select questions" };
  }

  if (question.question_type === "text") {
    if (question.is_required && !value.answerText) {
      return { ok: false, error: "A text answer is required" };
    }

    return {
      ok: true,
      value: {
        answerText: value.answerText,
        answerInteger: null,
        selectedAnswerOptionIds: [],
        otherText: null
      }
    };
  }

  if (question.question_type === "integer") {
    if (question.is_required && value.answerInteger === null) {
      return { ok: false, error: "An integer answer is required" };
    }

    return {
      ok: true,
      value: {
        answerText: null,
        answerInteger: value.answerInteger,
        selectedAnswerOptionIds: [],
        otherText: null
      }
    };
  }

  if (question.question_type === "single_select") {
    const otherValidation = validateOtherSelection(question, value);

    if (!otherValidation.ok) {
      return otherValidation;
    }

    const selectionCount =
      value.selectedAnswerOptionIds.length + (otherValidation.value ? 1 : 0);

    if (question.is_required && selectionCount !== 1) {
      return { ok: false, error: "Select exactly one answer option" };
    }

    if (!question.is_required && selectionCount > 1) {
      return { ok: false, error: "Select no more than one answer option" };
    }
  }

  if (question.question_type === "multi_select") {
    const otherValidation = validateOtherSelection(question, value);

    if (!otherValidation.ok) {
      return otherValidation;
    }

    if (
      question.is_required &&
      value.selectedAnswerOptionIds.length === 0 &&
      !otherValidation.value
    ) {
      return { ok: false, error: "Select at least one answer option" };
    }
  }

  if (question.question_type === "scale") {
    if (question.is_required && value.selectedAnswerOptionIds.length !== 1) {
      return { ok: false, error: "Select exactly one scale value" };
    }

    if (!question.is_required && value.selectedAnswerOptionIds.length > 1) {
      return { ok: false, error: "Select no more than one scale value" };
    }
  }

  if (value.selectedAnswerOptionIds.length > 0) {
    const optionsResult = await queryable.query<{ id: number; option_text: string }>(
      `select id, option_text
       from answer_options
       where question_id = $1
         and id = any($2::int[])
       order by id`,
      [question.id, value.selectedAnswerOptionIds]
    );

    if (optionsResult.rowCount !== value.selectedAnswerOptionIds.length) {
      return { ok: false, error: "Selected answer options must belong to the question" };
    }

    if (question.question_type === "scale") {
      const selectedOption = optionsResult.rows[0];
      const scaleValue = selectedOption ? parseScaleOptionValue(selectedOption.option_text) : null;

      if (scaleValue === null) {
        return { ok: false, error: "Selected scale value is not valid" };
      }

      return {
        ok: true,
        value: {
          answerText: null,
          answerInteger: scaleValue,
          selectedAnswerOptionIds: value.selectedAnswerOptionIds,
          otherText: null
        }
      };
    }
  }

  return {
    ok: true,
    value: {
      answerText: null,
      answerInteger: null,
      selectedAnswerOptionIds: value.selectedAnswerOptionIds,
      otherText:
        question.question_type === "single_select" || question.question_type === "multi_select"
          ? value.otherText
          : null
    }
  };
}

function validateOtherSelection(
  question: SurveyQuestionRecord,
  value: AnswerRequestValue
): ValidationResult<boolean> {
  if (!value.isOtherSelected && !value.otherText) {
    return { ok: true, value: false };
  }

  if (!question.allow_other) {
    return { ok: false, error: "Other is not enabled for this question" };
  }

  if (!value.otherText) {
    return { ok: false, error: "Other text is required when Other is selected" };
  }

  return { ok: true, value: true };
}

export async function savePageAnswers(
  queryable: Queryable,
  survey: Survey,
  pageId: number,
  attemptId: number,
  value: PageAnswerRequestValue
): Promise<ValidationResult<undefined>> {
  const page = survey.pages.find((candidate) => candidate.id === pageId);

  if (!page) {
    return { ok: false, error: "Page does not belong to this survey" };
  }

  const questions = getQuestionsForPage(survey, pageId);
  const questionIds = new Set(questions.map((question) => question.id));

  for (const answer of value.answers) {
    if (!questionIds.has(answer.questionId)) {
      return { ok: false, error: "All answers must belong to the submitted page" };
    }
  }

  const answersByQuestionId = new Map(value.answers.map((answer) => [answer.questionId, answer]));

  for (const question of questions) {
    const answer =
      answersByQuestionId.get(question.id) ??
      ({
        attemptId: value.attemptId,
        questionId: question.id,
        answerText: null,
        answerInteger: null,
        selectedAnswerOptionIds: [],
        isOtherSelected: false,
        otherText: null
      } satisfies AnswerRequestValue);
    const questionRecord = {
      id: question.id,
      survey_id: question.surveyId,
      page_id: question.pageId,
      question_text: question.questionText,
      question_type: question.questionType,
      allow_other: question.allowOther,
      display_order: question.displayOrder,
      is_required: question.isRequired,
      help_text: question.helpText,
      created_at: new Date(question.createdAt),
      updated_at: new Date(question.updatedAt)
    };
    const validation = await validateAnswerForQuestion(queryable, questionRecord, answer);

    if (!validation.ok) {
      return validation;
    }

    await saveAnswer(queryable, attemptId, questionRecord, validation.value);
  }

  return { ok: true, value: undefined };
}

export async function saveAnswer(
  queryable: Queryable,
  attemptId: number,
  question: SurveyQuestionRecord,
  value: NormalizedAnswerValue
): Promise<void> {
  const responseResult = await queryable.query<{ id: number }>(
    `insert into survey_response_answers (
       survey_attempt_id,
       question_id,
       answer_text,
       answer_integer,
       other_text
     )
     values ($1, $2, $3, $4, $5)
     on conflict (survey_attempt_id, question_id)
     do update
     set answer_text = excluded.answer_text,
         answer_integer = excluded.answer_integer,
         other_text = excluded.other_text,
         updated_at = now()
     returning id`,
    [attemptId, question.id, value.answerText, value.answerInteger, value.otherText]
  );
  const responseAnswerId = responseResult.rows[0].id;

  await queryable.query(
    `delete from survey_response_selected_options
     where survey_response_answer_id = $1`,
    [responseAnswerId]
  );

  if (value.selectedAnswerOptionIds.length > 0) {
    await queryable.query(
      `insert into survey_response_selected_options (
         survey_response_answer_id,
         answer_option_id
       )
       select $1, unnest($2::int[])`,
      [responseAnswerId, value.selectedAnswerOptionIds]
    );
  }
}

// Loads an attempt's saved answers (with selected options) through the supplied
// queryable so callers inside an open transaction observe the just-saved rows.
// Branching/jump rules key off selected options, so they must be hydrated for
// the path walk to resolve correctly.
async function fetchAttemptResponses(
  queryable: Queryable,
  attemptId: number
): Promise<SurveyResponseAnswer[]> {
  const responsesResult = await queryable.query<SurveyResponseAnswerRecord>(
    `select
       id,
       survey_attempt_id,
       question_id,
       answer_text,
       answer_integer,
       other_text,
       created_at,
       updated_at
     from survey_response_answers
     where survey_attempt_id = $1
     order by id`,
    [attemptId]
  );
  const responseIds = responsesResult.rows.map((response) => response.id);
  const selectedOptionsResult =
    responseIds.length > 0
      ? await queryable.query<SelectedOptionRecord>(
          `select
             survey_response_answer_id,
             answer_option_id
           from survey_response_selected_options
           where survey_response_answer_id = any($1::int[])
           order by survey_response_answer_id, answer_option_id`,
          [responseIds]
        )
      : { rows: [] as SelectedOptionRecord[] };
  const selectedOptionsByResponseId = new Map<number, number[]>();

  for (const selectedOption of selectedOptionsResult.rows) {
    const selectedIds =
      selectedOptionsByResponseId.get(selectedOption.survey_response_answer_id) ?? [];
    selectedIds.push(selectedOption.answer_option_id);
    selectedOptionsByResponseId.set(selectedOption.survey_response_answer_id, selectedIds);
  }

  return responsesResult.rows.map((response) =>
    mapSurveyResponseAnswerRecord(
      response,
      selectedOptionsByResponseId.get(response.id) ?? []
    )
  );
}

// Recomputes the revealed-question set from the attempt's current answers and
// deletes any saved answer whose question is no longer revealed. When a
// respondent changes an earlier branching/jump answer (or flips a skip
// trigger), the runtime reroutes the path and the old branch's questions fall
// off it; this keeps the stored answers matching what the respondent actually
// saw and answered on their final path. Cascade on
// survey_response_selected_options removes the linked option rows. Reverses the
// Phase 8 "keep historical answers, mark them off-path" decision — see
// markdown/FOLLOW_UPS.md.
//
// Uses resolveProgressivePageState — the same resolver the page runtime uses to
// reveal questions — so jump/skip semantics (including JUMP_TO_PAGE and
// HIDE_QUESTION) can never diverge from what the respondent was shown. Scope is
// "all off-path": both jump-abandoned branches and rule-hidden questions are
// pruned.
//
// Safe for in-progress attempts: not-yet-reached questions have no stored rows,
// and the resolver projects forward along the normal flow, so only already-saved
// rows that are genuinely off-path are removed. A loop yields an unreliable
// partial state, so pruning is skipped in that case; an empty keep-set (a survey
// with no revealable questions) is likewise left untouched.
export async function pruneOffPathAnswers(
  queryable: Queryable,
  survey: Survey,
  attemptId: number
): Promise<void> {
  const responses = await fetchAttemptResponses(queryable, attemptId);
  const { visibleQuestionIdsByPageId, hasLoop } = resolveProgressivePageState(survey, responses);

  if (hasLoop) {
    return;
  }

  const keepQuestionIds = Object.values(visibleQuestionIdsByPageId).flat();

  if (keepQuestionIds.length === 0) {
    return;
  }

  await queryable.query(
    `delete from survey_response_answers
     where survey_attempt_id = $1
       and question_id <> all($2::int[])`,
    [attemptId, keepQuestionIds]
  );
}

export function validateReachedRequiredQuestions(
  survey: Survey,
  attempt: SurveyAttempt
): ValidationResult<undefined> {
  const responsesByQuestionId = buildResponseMap(attempt);
  const state = resolveProgressivePageState(survey, attempt.responses);

  if (state.hasLoop) {
    return { ok: false, error: "Survey navigation contains a loop" };
  }

  // A non-null currentQuestion means the progressive walk has not yet revealed
  // and resolved every question on the path. Optional questions also gate
  // completion until they have been explicitly visited (a response row exists),
  // so word the message by whether the blocking question is required.
  // See FOLLOW_UPS "Optional-question completion gating" for the implications.
  if (state.currentQuestion) {
    return {
      ok: false,
      error: state.currentQuestion.isRequired
        ? `Required question ${state.currentQuestion.displayOrder} is unanswered`
        : `Question ${state.currentQuestion.displayOrder} must be visited before completing`
    };
  }

  for (const page of state.path) {
    for (const questionId of state.visibleQuestionIdsByPageId[page.id] ?? []) {
      const question = survey.questions.find((candidate) => candidate.id === questionId);

      if (!question) {
        continue;
      }

      const response = responsesByQuestionId.get(question.id);

      if (question.isRequired && !hasMeaningfulResponse(question, response)) {
        return { ok: false, error: `Required question ${question.displayOrder} is unanswered` };
      }
    }
  }

  return { ok: true, value: undefined };
}

export function determineCurrentPage(
  survey: Survey,
  attempt: SurveyAttempt
): SurveyPage | null {
  if (attempt.status === "completed") {
    return null;
  }

  return resolveProgressivePageState(survey, attempt.responses).currentPage;
}

export function determineCurrentQuestion(
  survey: Survey,
  attempt: SurveyAttempt
): SurveyQuestion | null {
  if (attempt.status === "completed") {
    return null;
  }

  return resolveProgressivePageState(survey, attempt.responses).currentQuestion;
}

function determineProgressiveAttemptState(
  survey: Survey,
  attempt: SurveyAttempt
): {
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
} {
  if (attempt.status === "completed") {
    return {
      currentQuestion: null,
      currentPage: null,
      currentPageQuestionIds: []
    };
  }

  const state = resolveProgressivePageState(survey, attempt.responses);

  return {
    currentQuestion: state.currentQuestion,
    currentPage: state.currentPage,
    currentPageQuestionIds: state.currentPageQuestionIds
  };
}

function buildResponseMap(attempt: SurveyAttempt): Map<number, SurveyResponseAnswer> {
  return new Map(attempt.responses.map((response) => [response.questionId, response]));
}

function hasMeaningfulResponse(
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (question.questionType === "text") {
    return Boolean(response.answerText?.trim());
  }

  if (question.questionType === "integer") {
    return Number.isInteger(response.answerInteger);
  }

  if (question.questionType === "single_select") {
    return response.selectedAnswerOptionIds.length === 1 || Boolean(response.otherText?.trim());
  }

  if (question.questionType === "scale") {
    return response.selectedAnswerOptionIds.length === 1 && Number.isInteger(response.answerInteger);
  }

  return response.selectedAnswerOptionIds.length > 0 || Boolean(response.otherText?.trim());
}

function isActiveAttemptUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "survey_attempts_one_active_per_user_survey_idx"
  );
}
