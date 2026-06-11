import {
  resolveNextQuestion,
  type AdminAttemptAnswer,
  type AdminAttemptDetailResponse,
  type AdminAttemptSummary,
  type ReportParticipant,
  type Survey,
  type SurveyAttempt,
  type SurveyAttemptStatus,
  type SurveyQuestion,
  type SurveyReportSummary,
  type SurveyResponseAnswer
} from "@survey-portal/shared";

import { pool } from "../db.js";
import { buildCsv, type CsvFieldValue } from "./csv.js";
import {
  fetchSurveyRecord,
  mapSurveyAttemptRecord,
  mapSurveyResponseAnswerRecord,
  type SelectedOptionRecord,
  type SurveyAttemptRecord,
  type SurveyResponseAnswerRecord
} from "./surveyRecords.js";
import { fetchSurveyStructures } from "./surveyStructure.js";

interface AttemptCountRecord {
  status: SurveyAttemptStatus;
  count: string;
}

interface QuestionStatRecord {
  question_id: number;
  answered_count: string;
  blank_count: string;
}

interface ParticipantRecord {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

// A response row "has content" when any answer value was saved. Rows without
// content are intentional blank skips of optional questions.
const meaningfulResponseSql = `(
  survey_response_answers.answer_text is not null
  or survey_response_answers.answer_integer is not null
  or exists (
    select 1
    from survey_response_selected_options
    where survey_response_selected_options.survey_response_answer_id = survey_response_answers.id
  )
)`;

export async function fetchSurveyReportSummary(
  surveyId: number
): Promise<SurveyReportSummary | null> {
  const [survey] = await fetchSurveyStructures({
    surveyId,
    includeAllStatuses: true,
    includeDeleted: true,
    includeHiddenTags: true
  });

  if (!survey) {
    return null;
  }

  const countsResult = await pool.query<AttemptCountRecord>(
    `select status, count(*)::text as count
     from survey_attempts
     where survey_id = $1
     group by status`,
    [surveyId]
  );

  const countsByStatus = new Map(
    countsResult.rows.map((row) => [row.status, Number(row.count)])
  );
  const inProgress =
    (countsByStatus.get("in_progress") ?? 0) + (countsByStatus.get("not_started") ?? 0);
  const completed = countsByStatus.get("completed") ?? 0;
  const abandoned = countsByStatus.get("abandoned") ?? 0;
  const total = inProgress + completed + abandoned;

  const statsResult = await pool.query<QuestionStatRecord>(
    `select
       survey_questions.id as question_id,
       count(survey_response_answers.id) filter (where ${meaningfulResponseSql})::text as answered_count,
       count(survey_response_answers.id) filter (where not ${meaningfulResponseSql})::text as blank_count
     from survey_questions
     left join survey_response_answers
       on survey_response_answers.question_id = survey_questions.id
     where survey_questions.survey_id = $1
     group by survey_questions.id`,
    [surveyId]
  );
  const statsByQuestionId = new Map(statsResult.rows.map((row) => [row.question_id, row]));

  return {
    surveyId: survey.id,
    title: survey.title,
    status: survey.status,
    attemptCounts: {
      inProgress,
      completed,
      abandoned,
      total
    },
    completionRate: total === 0 ? 0 : completed / total,
    questionStats: sortQuestions(survey.questions).map((question) => ({
      questionId: question.id,
      displayOrder: question.displayOrder,
      questionText: question.questionText,
      questionType: question.questionType,
      isRequired: question.isRequired,
      answeredCount: Number(statsByQuestionId.get(question.id)?.answered_count ?? 0),
      blankCount: Number(statsByQuestionId.get(question.id)?.blank_count ?? 0)
    }))
  };
}

export async function fetchAdminAttempts(surveyId: number): Promise<AdminAttemptSummary[] | null> {
  const survey = await fetchSurveyRecord(pool, surveyId);

  if (!survey) {
    return null;
  }

  const attemptsResult = await pool.query<
    SurveyAttemptRecord & ParticipantRecord & { attempt_id: number; answered_count: string }
  >(
    `select
       survey_attempts.id as attempt_id,
       survey_attempts.status,
       survey_attempts.started_at,
       survey_attempts.last_activity_at,
       survey_attempts.completed_at,
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       count(survey_response_answers.id) filter (where ${meaningfulResponseSql})::text as answered_count
     from survey_attempts
     join users on users.id = survey_attempts.user_id
     left join survey_response_answers
       on survey_response_answers.survey_attempt_id = survey_attempts.id
     where survey_attempts.survey_id = $1
     group by survey_attempts.id, users.id
     order by survey_attempts.started_at desc nulls last, survey_attempts.id desc`,
    [surveyId]
  );

  return attemptsResult.rows.map((row) => ({
    attemptId: row.attempt_id,
    participant: mapParticipantRecord(row),
    status: row.status,
    startedAt: row.started_at?.toISOString() ?? null,
    lastActivityAt: row.last_activity_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    answeredCount: Number(row.answered_count)
  }));
}

export async function fetchAdminAttemptDetail(
  surveyId: number,
  attemptId: number
): Promise<AdminAttemptDetailResponse | null> {
  const [survey] = await fetchSurveyStructures({
    surveyId,
    includeAllStatuses: true,
    includeDeleted: true,
    includeHiddenTags: true
  });

  if (!survey) {
    return null;
  }

  const attempts = await fetchAttemptsWithResponsesForSurvey(surveyId, attemptId);
  const attempt = attempts[0];

  if (!attempt) {
    return null;
  }

  const participant = await fetchParticipant(attempt.userId);

  if (!participant) {
    return null;
  }

  return {
    surveyId: survey.id,
    surveyTitle: survey.title,
    participant,
    attempt,
    answers: buildAdminAttemptAnswers(survey, attempt)
  };
}

export async function buildSurveyCsvExport(
  surveyId: number
): Promise<{ filename: string; content: string } | null> {
  const [survey] = await fetchSurveyStructures({
    surveyId,
    includeAllStatuses: true,
    includeDeleted: true,
    includeHiddenTags: true
  });

  if (!survey) {
    return null;
  }

  const attempts = await fetchAttemptsWithResponsesForSurvey(surveyId);
  const participantIds = [...new Set(attempts.map((attempt) => attempt.userId))];
  const participantsById = await fetchParticipantsByIds(participantIds);

  const header = [
    "survey_id",
    "survey_title",
    "attempt_id",
    "participant_email",
    "participant_name",
    "attempt_status",
    "started_at",
    "completed_at",
    "question_order",
    "question_text",
    "question_type",
    "answer_state",
    "answer_text",
    "answer_integer",
    "selected_options",
    "hidden_tags",
    "on_final_path"
  ];
  const rows: CsvFieldValue[][] = [];

  for (const attempt of attempts) {
    const participant = participantsById.get(attempt.userId);
    const answers = buildAdminAttemptAnswers(survey, attempt);

    for (const answer of answers) {
      if (answer.state === "not_reached") {
        continue;
      }

      rows.push([
        survey.id,
        survey.title,
        attempt.id,
        participant?.email ?? "",
        participant ? `${participant.firstName} ${participant.lastName}` : "",
        attempt.status,
        attempt.startedAt,
        attempt.completedAt,
        answer.displayOrder,
        answer.questionText,
        answer.questionType,
        answer.state,
        answer.answerText,
        answer.answerInteger,
        answer.selectedOptions.map((option) => option.optionText).join("; "),
        answer.selectedOptions
          .flatMap((option) =>
            option.hiddenTags.map((tag) => `${tag.tagKey}=${tag.tagValue}`)
          )
          .join("; "),
        answer.onFinalPath
      ]);
    }
  }

  return {
    filename: `survey-${survey.id}-responses.csv`,
    content: buildCsv(header, rows)
  };
}

// Walks the navigation path implied by the attempt's saved answers, exactly
// as the shared runtime resolver would during survey taking. Questions
// outside this walk either were never reached or hold historical answers
// from a changed branching path.
export function collectFinalPathQuestionIds(
  survey: Survey,
  responsesByQuestionId: Map<number, SurveyResponseAnswer>
): Set<number> {
  const visited = new Set<number>();
  let question: SurveyQuestion | null = sortQuestions(survey.questions)[0] ?? null;

  while (question && !visited.has(question.id)) {
    visited.add(question.id);
    question = resolveNextQuestion(survey, question, responsesByQuestionId.get(question.id));
  }

  return visited;
}

export function buildAdminAttemptAnswers(
  survey: Survey,
  attempt: SurveyAttempt
): AdminAttemptAnswer[] {
  const responsesByQuestionId = new Map(
    attempt.responses.map((response) => [response.questionId, response])
  );
  const finalPathQuestionIds = collectFinalPathQuestionIds(survey, responsesByQuestionId);

  return sortQuestions(survey.questions).map((question) => {
    const response = responsesByQuestionId.get(question.id);
    const optionsById = new Map(question.answerOptions.map((option) => [option.id, option]));
    const selectedOptions = (response?.selectedAnswerOptionIds ?? []).map((optionId) => {
      const option = optionsById.get(optionId);

      return {
        answerOptionId: optionId,
        optionText: option?.optionText ?? `Removed option ${optionId}`,
        hiddenTags: (option?.answerTags ?? []).map((tag) => ({
          tagKey: tag.tagKey,
          tagValue: tag.tagValue
        }))
      };
    });

    return {
      questionId: question.id,
      displayOrder: question.displayOrder,
      questionText: question.questionText,
      questionType: question.questionType,
      isRequired: question.isRequired,
      state: !response
        ? ("not_reached" as const)
        : responseHasContent(response)
          ? ("answered" as const)
          : ("skipped_blank" as const),
      answerText: response?.answerText ?? null,
      answerInteger: response?.answerInteger ?? null,
      selectedOptions,
      onFinalPath: finalPathQuestionIds.has(question.id)
    };
  });
}

function responseHasContent(response: SurveyResponseAnswer): boolean {
  return (
    Boolean(response.answerText?.trim()) ||
    response.answerInteger !== null ||
    response.selectedAnswerOptionIds.length > 0
  );
}

async function fetchAttemptsWithResponsesForSurvey(
  surveyId: number,
  attemptId?: number
): Promise<SurveyAttempt[]> {
  const values: unknown[] = [surveyId];
  let condition = "survey_attempts.survey_id = $1";

  if (attemptId !== undefined) {
    values.push(attemptId);
    condition += ` and survey_attempts.id = $${values.length}`;
  }

  const attemptsResult = await pool.query<SurveyAttemptRecord>(
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
     where ${condition}
     order by id`,
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
    selectedOptionsByResponseId.set(selectedOption.survey_response_answer_id, selectedIds);
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

async function fetchParticipant(userId: number): Promise<ReportParticipant | null> {
  const participants = await fetchParticipantsByIds([userId]);

  return participants.get(userId) ?? null;
}

async function fetchParticipantsByIds(
  userIds: number[]
): Promise<Map<number, ReportParticipant>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const result = await pool.query<ParticipantRecord>(
    `select id, first_name, last_name, email
     from users
     where id = any($1::int[])`,
    [userIds]
  );

  return new Map(result.rows.map((row) => [row.id, mapParticipantRecord(row)]));
}

function mapParticipantRecord(record: ParticipantRecord): ReportParticipant {
  return {
    id: record.id,
    firstName: record.first_name,
    lastName: record.last_name,
    email: record.email
  };
}

function sortQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  return [...questions].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );
}
