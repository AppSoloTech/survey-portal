import {
  resolveNextQuestion,
  type AnswerSurveyResponse,
  type MySurveyResponse,
  type MySurveysResponse,
  type StartSurveyResponse,
  type Survey,
  type SurveyAttempt,
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
import type {
  AnswerRequestValue,
  NormalizedAnswerValue,
  ValidationResult
} from "./validation.js";

const { DatabaseError } = pg;

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

export async function fetchActiveAttempt(
  userId: number,
  surveyId: number
): Promise<SurveyAttemptRecord | null> {
  const result = await pool.query<SurveyAttemptRecord>(
    `select
       id,
       survey_id,
       user_id,
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

export async function buildStartSurveyResponse(
  attemptId: number,
  userId: number
): Promise<StartSurveyResponse> {
  const detail = await buildAttemptDetail(attemptId, userId);

  return {
    attempt: detail.attempt,
    survey: detail.survey,
    currentQuestion: detail.currentQuestion
  };
}

export async function buildAnswerSurveyResponse(
  attemptId: number,
  userId: number
): Promise<AnswerSurveyResponse> {
  const detail = await buildAttemptDetail(attemptId, userId);

  return {
    attempt: detail.attempt,
    currentQuestion: detail.currentQuestion,
    isCompleteReady: detail.currentQuestion === null
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

  const [survey] = await fetchSurveyStructures({
    surveyId: attempt.surveyId,
    includeAllStatuses: true,
    includeHiddenTags: false
  });

  if (!survey || survey.status === "draft") {
    return null;
  }

  return {
    attempt,
    survey,
    currentQuestion: determineCurrentQuestion(survey, attempt)
  };
}

export async function buildAttemptDetail(
  attemptId: number,
  userId: number
): Promise<{
  attempt: SurveyAttempt;
  survey: Survey;
  currentQuestion: SurveyQuestion | null;
}> {
  const response = await buildMySurveyResponse(attemptId, userId);

  if (!response) {
    throw new Error("Survey attempt not found");
  }

  return response;
}

export async function buildMySurveysResponse(userId: number): Promise<MySurveysResponse> {
  const surveyIdResult = await pool.query<{ id: number }>(
    `with survey_scope as (
       select id
       from surveys
       where status = 'published'
       union
       select surveys.id
       from survey_attempts
       join surveys on surveys.id = survey_attempts.survey_id
       where survey_attempts.user_id = $1
         and surveys.status <> 'draft'
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
  userId: number
): Promise<SurveyAttempt | null> {
  const attempts = await fetchAttemptsByCondition(
    `survey_attempts.id = $2`,
    [userId, attemptId]
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
    `survey_attempts.survey_id = any($2::int[])`,
    [userId, surveyIds]
  );
}

async function fetchAttemptsByCondition(
  condition: string,
  values: unknown[]
): Promise<SurveyAttempt[]> {
  const attemptsResult = await pool.query<SurveyAttemptRecord>(
    `select
       survey_attempts.id,
       survey_attempts.survey_id,
       survey_attempts.user_id,
       survey_attempts.status,
       survey_attempts.started_at,
       survey_attempts.last_activity_at,
       survey_attempts.completed_at,
       survey_attempts.created_at,
       survey_attempts.updated_at
     from survey_attempts
     where survey_attempts.user_id = $1
       and ${condition}
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

  const responsesResult = await pool.query<SurveyResponseAnswerRecord>(
    `select
       id,
       survey_attempt_id,
       question_id,
       answer_text,
       answer_integer,
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
      ? await pool.query<SelectedOptionRecord>(
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
  if (question.question_type === "text") {
    if (question.is_required && !value.answerText) {
      return { ok: false, error: "A text answer is required" };
    }

    return {
      ok: true,
      value: {
        answerText: value.answerText,
        answerInteger: null,
        selectedAnswerOptionIds: []
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
        selectedAnswerOptionIds: []
      }
    };
  }

  if (question.question_type === "single_select") {
    if (question.is_required && value.selectedAnswerOptionIds.length !== 1) {
      return { ok: false, error: "Select exactly one answer option" };
    }

    if (!question.is_required && value.selectedAnswerOptionIds.length > 1) {
      return { ok: false, error: "Select no more than one answer option" };
    }
  }

  if (question.question_type === "multi_select") {
    if (question.is_required && value.selectedAnswerOptionIds.length === 0) {
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
          selectedAnswerOptionIds: value.selectedAnswerOptionIds
        }
      };
    }
  }

  return {
    ok: true,
    value: {
      answerText: null,
      answerInteger: null,
      selectedAnswerOptionIds: value.selectedAnswerOptionIds
    }
  };
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
       answer_integer
     )
     values ($1, $2, $3, $4)
     on conflict (survey_attempt_id, question_id)
     do update
     set answer_text = excluded.answer_text,
         answer_integer = excluded.answer_integer,
         updated_at = now()
     returning id`,
    [attemptId, question.id, value.answerText, value.answerInteger]
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

export function validateReachedRequiredQuestions(
  survey: Survey,
  attempt: SurveyAttempt
): ValidationResult<undefined> {
  const responsesByQuestionId = buildResponseMap(attempt);
  let question = findFirstQuestion(survey);
  const visitedQuestionIds = new Set<number>();

  while (question) {
    if (visitedQuestionIds.has(question.id)) {
      return { ok: false, error: "Survey navigation contains a loop" };
    }

    visitedQuestionIds.add(question.id);

    const response = responsesByQuestionId.get(question.id);

    if (question.isRequired && !hasMeaningfulResponse(question, response)) {
      return { ok: false, error: `Required question ${question.displayOrder} is unanswered` };
    }

    question = resolveNextQuestion(survey, question, response);
  }

  return { ok: true, value: undefined };
}

export function determineCurrentQuestion(
  survey: Survey,
  attempt: SurveyAttempt
): SurveyQuestion | null {
  if (attempt.status === "completed") {
    return null;
  }

  const responsesByQuestionId = buildResponseMap(attempt);
  let question = findFirstQuestion(survey);
  const visitedQuestionIds = new Set<number>();

  while (question) {
    if (visitedQuestionIds.has(question.id)) {
      return null;
    }

    visitedQuestionIds.add(question.id);

    const response = responsesByQuestionId.get(question.id);

    if (!response || (question.isRequired && !hasMeaningfulResponse(question, response))) {
      return question;
    }

    question = resolveNextQuestion(survey, question, response);
  }

  return null;
}

function findFirstQuestion(survey: Survey): SurveyQuestion | null {
  return (
    [...survey.questions].sort(
      (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
    )[0] ?? null
  );
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
    return response.selectedAnswerOptionIds.length === 1;
  }

  if (question.questionType === "scale") {
    return response.selectedAnswerOptionIds.length === 1 && Number.isInteger(response.answerInteger);
  }

  return response.selectedAnswerOptionIds.length > 0;
}

function isActiveAttemptUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "survey_attempts_one_active_per_user_survey_idx"
  );
}
