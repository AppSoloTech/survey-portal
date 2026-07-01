import {
  resolveProgressivePageState,
  valueTagMatchesResponse,
  type AdminAttemptAnswer,
  type AdminAttemptDetailResponse,
  type AdminAttemptReviewTag,
  type AdminAttemptSummary,
  type ReportParticipant,
  type Survey,
  type SurveyAttempt,
  type SurveyAttemptStatus,
  type SurveyQuestion,
  type SurveyReportSummary,
  type SurveyResponseAnswer
} from "@survey-portal/shared";
import type { Pool, PoolClient } from "pg";

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

type Queryable = Pool | PoolClient;

interface AttemptCountRecord {
  status: SurveyAttemptStatus;
  count: string;
}

interface QuestionStatRecord {
  question_id: number;
  answered_count: string;
  blank_count: string;
  other_response_count: string;
}

interface ParticipantRecord {
  id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface ResponseAnswerTagRecord {
  id: number;
  answer_id: number;
  tag_definition_id: number;
  tag_key: string;
  tag_value: string;
  is_manual: boolean;
  assigned_by: number | null;
  created_at: Date;
}

type ReviewTagMutationResult =
  | { ok: true; reviewTagGroupIds: number[]; reviewTags: AdminAttemptReviewTag[] }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 400; error: string };

function buildAnonymousParticipant(contactEmail: string | null): ReportParticipant {
  return {
    id: null,
    firstName: "Anonymous",
    lastName: "respondent",
    email: contactEmail ?? "Anonymous survey link",
    type: "anonymous"
  };
}

// A response row "has content" when any answer value was saved. Rows without
// content are intentional blank skips of optional questions.
const meaningfulResponseSql = `(
  survey_response_answers.answer_text is not null
  or survey_response_answers.answer_integer is not null
  or survey_response_answers.other_text is not null
  or exists (
    select 1
    from survey_response_selected_options
    where survey_response_selected_options.survey_response_answer_id = survey_response_answers.id
  )
)`;

// Inclusive calendar-date window over survey_attempts.started_at. Values
// are validated YYYY-MM-DD strings (see validateAttemptDateRange); the
// upper bound compares against the next day so the "to" date is inclusive.
export interface AttemptDateRange {
  from?: string;
  to?: string;
}

// Appends range predicates for the given attempts-table alias, pushing
// parameter values onto the shared values array. Returns SQL beginning with
// " and ..." or an empty string when no range is set.
function attemptRangeSql(alias: string, range: AttemptDateRange | undefined, values: unknown[]): string {
  let sql = "";

  if (range?.from) {
    values.push(range.from);
    sql += ` and ${alias}.started_at >= $${values.length}::date`;
  }

  if (range?.to) {
    values.push(range.to);
    sql += ` and ${alias}.started_at < ($${values.length}::date + 1)`;
  }

  return sql;
}

// Variant for use inside aggregate `filter (where ...)` clauses, where a
// leading "true" keeps the expression valid with or without a range.
function attemptRangeFilterSql(
  alias: string,
  range: AttemptDateRange | undefined,
  values: unknown[]
): string {
  return `true${attemptRangeSql(alias, range, values)}`;
}

export async function fetchSurveyReportSummary(
  surveyId: number,
  range?: AttemptDateRange
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

  const countsValues: unknown[] = [surveyId];
  const countsResult = await pool.query<AttemptCountRecord>(
    `select status, count(*)::text as count
     from survey_attempts
     where survey_id = $1${attemptRangeSql("survey_attempts", range, countsValues)}
     group by status`,
    countsValues
  );

  const countsByStatus = new Map(
    countsResult.rows.map((row) => [row.status, Number(row.count)])
  );
  const inProgress =
    (countsByStatus.get("in_progress") ?? 0) + (countsByStatus.get("not_started") ?? 0);
  const completed = countsByStatus.get("completed") ?? 0;
  const abandoned = countsByStatus.get("abandoned") ?? 0;
  const total = inProgress + completed + abandoned;

  const statsValues: unknown[] = [surveyId];
  const statsRange = attemptRangeFilterSql("survey_attempts", range, statsValues);
  const statsResult = await pool.query<QuestionStatRecord>(
     `select
       survey_questions.id as question_id,
       count(survey_response_answers.id) filter (where ${meaningfulResponseSql} and ${statsRange})::text as answered_count,
       count(survey_response_answers.id) filter (where not ${meaningfulResponseSql} and ${statsRange})::text as blank_count,
       count(survey_response_answers.id) filter (
         where survey_response_answers.other_text is not null and ${statsRange}
       )::text as other_response_count
     from survey_questions
     left join survey_response_answers
       on survey_response_answers.question_id = survey_questions.id
     left join survey_attempts
       on survey_attempts.id = survey_response_answers.survey_attempt_id
     where survey_questions.survey_id = $1
     group by survey_questions.id`,
    statsValues
  );
  const statsByQuestionId = new Map(statsResult.rows.map((row) => [row.question_id, row]));

  // Selection counts per answer option, for distribution charts on
  // option-backed questions.
  const optionValues: unknown[] = [surveyId];
  const optionRange = attemptRangeFilterSql("survey_attempts", range, optionValues);
  const optionResult = await pool.query<{ option_id: number; selection_count: string }>(
    `select
       answer_options.id as option_id,
       count(selected_options.id) filter (where ${optionRange})::text as selection_count
     from answer_options
     join survey_questions
       on survey_questions.id = answer_options.question_id
      and survey_questions.survey_id = $1
     left join survey_response_selected_options selected_options
       on selected_options.answer_option_id = answer_options.id
     left join survey_response_answers
       on survey_response_answers.id = selected_options.survey_response_answer_id
     left join survey_attempts
       on survey_attempts.id = survey_response_answers.survey_attempt_id
     group by answer_options.id`,
    optionValues
  );
  const selectionCountByOptionId = new Map(
    optionResult.rows.map((row) => [row.option_id, Number(row.selection_count)])
  );

  // Hidden-tag rollup: every tag pair configured on this survey — on answer
  // options (counted when a tagged option is selected) or as value tags on
  // text/integer questions (counted when a response satisfies the tag's
  // condition). One union keeps respondent counts distinct across both
  // sources. Zero-count pairs stay visible so admins see the full taxonomy.
  const tagValues: unknown[] = [surveyId];
  const tagRange = attemptRangeFilterSql("tag_events", range, tagValues);
  const tagResult = await pool.query<{
    tag_key: string;
    tag_value: string;
    selection_count: string;
    respondent_count: string;
  }>(
    `with tag_events as (
       select
         answer_tags.tag_key,
         answer_tags.tag_value,
         selected_options.id as event_id,
         survey_attempts.id as attempt_id,
         survey_attempts.started_at
       from answer_tags
       join answer_options on answer_options.id = answer_tags.answer_option_id
       join survey_questions
         on survey_questions.id = answer_options.question_id
        and survey_questions.survey_id = $1
       left join survey_response_selected_options selected_options
         on selected_options.answer_option_id = answer_options.id
       left join survey_response_answers
         on survey_response_answers.id = selected_options.survey_response_answer_id
       left join survey_attempts
         on survey_attempts.id = survey_response_answers.survey_attempt_id
       union all
       select
         question_other_tags.tag_key,
         question_other_tags.tag_value,
         survey_response_answers.id as event_id,
         survey_attempts.id as attempt_id,
         survey_attempts.started_at
       from question_other_tags
       join survey_questions
         on survey_questions.id = question_other_tags.question_id
        and survey_questions.survey_id = $1
       left join survey_response_answers
         on survey_response_answers.question_id = survey_questions.id
        and survey_response_answers.other_text is not null
       left join survey_attempts
         on survey_attempts.id = survey_response_answers.survey_attempt_id
       union all
       select
         question_value_tags.tag_key,
         question_value_tags.tag_value,
         survey_response_answers.id as event_id,
         survey_attempts.id as attempt_id,
         survey_attempts.started_at
       from question_value_tags
       join survey_questions
         on survey_questions.id = question_value_tags.question_id
        and survey_questions.survey_id = $1
       left join survey_response_answers
         on survey_response_answers.question_id = survey_questions.id
        and (
          (survey_questions.question_type = 'text'
            and coalesce(trim(survey_response_answers.answer_text), '') <> '')
          or (survey_questions.question_type = 'integer'
            and survey_response_answers.answer_integer is not null
            and (question_value_tags.integer_min is null
              or survey_response_answers.answer_integer >= question_value_tags.integer_min)
            and (question_value_tags.integer_max is null
              or survey_response_answers.answer_integer <= question_value_tags.integer_max))
        )
       left join survey_attempts
         on survey_attempts.id = survey_response_answers.survey_attempt_id
     )
     select
       tag_key,
       tag_value,
       count(event_id) filter (where ${tagRange})::text as selection_count,
       count(distinct attempt_id) filter (where ${tagRange})::text as respondent_count
     from tag_events
     group by tag_key, tag_value
     order by tag_key, tag_value`,
    tagValues
  );

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
      blankCount: Number(statsByQuestionId.get(question.id)?.blank_count ?? 0),
      optionStats: [...question.answerOptions]
        .sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id)
        .map((option) => ({
          answerOptionId: option.id,
          optionText: option.optionText,
          displayOrder: option.displayOrder,
          selectionCount: selectionCountByOptionId.get(option.id) ?? 0
        })),
      otherResponseCount: Number(statsByQuestionId.get(question.id)?.other_response_count ?? 0)
    })),
    tagStats: tagResult.rows.map((row) => ({
      tagKey: row.tag_key,
      tagValue: row.tag_value,
      selectionCount: Number(row.selection_count),
      respondentCount: Number(row.respondent_count)
    }))
  };
}

export async function fetchAdminAttempts(
  surveyId: number,
  range?: AttemptDateRange
): Promise<AdminAttemptSummary[] | null> {
  const survey = await fetchSurveyRecord(pool, surveyId);

  if (!survey) {
    return null;
  }

  const values: unknown[] = [surveyId];
  const rangeSql = attemptRangeSql("survey_attempts", range, values);
  const attemptsResult = await pool.query<
    SurveyAttemptRecord & ParticipantRecord & { attempt_id: number; answered_count: string }
  >(
    `select
       survey_attempts.id as attempt_id,
       survey_attempts.status,
       survey_attempts.user_id,
       survey_attempts.anonymous_contact_email,
       survey_attempts.started_at,
       survey_attempts.last_activity_at,
       survey_attempts.completed_at,
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       count(survey_response_answers.id) filter (where ${meaningfulResponseSql})::text as answered_count
     from survey_attempts
     left join users on users.id = survey_attempts.user_id
     left join survey_response_answers
       on survey_response_answers.survey_attempt_id = survey_attempts.id
     where survey_attempts.survey_id = $1${rangeSql}
     group by survey_attempts.id, users.id
     order by survey_attempts.started_at desc nulls last, survey_attempts.id desc`,
    values
  );

  return attemptsResult.rows.map((row) => ({
    attemptId: row.attempt_id,
    participant: row.user_id
      ? mapParticipantRecord(row)
      : buildAnonymousParticipant(row.anonymous_contact_email),
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

  const participant = attempt.userId
    ? (await fetchParticipant(attempt.userId)) ?? buildAnonymousParticipant(null)
    : buildAnonymousParticipant(attempt.anonymousContactEmail);
  const reviewTagsByAnswerId = await fetchReviewTagsByAnswerIds(
    attempt.responses.map((response) => response.id)
  );
  const reviewTagGroupIdsByAnswerId = await fetchReviewTagGroupIdsByAnswerIds(
    attempt.responses.map((response) => response.id)
  );

  return {
    surveyId: survey.id,
    surveyTitle: survey.title,
    participant,
    attempt,
    answers: buildAdminAttemptAnswers(survey, attempt, reviewTagsByAnswerId, reviewTagGroupIdsByAnswerId)
  };
}

export async function buildSurveyCsvExport(
  surveyId: number,
  range?: AttemptDateRange
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

  const attempts = await fetchAttemptsWithResponsesForSurvey(surveyId, undefined, range);
  const reviewTagsByAnswerId = await fetchReviewTagsByAnswerIds(
    attempts.flatMap((attempt) => attempt.responses.map((response) => response.id))
  );
  const participantIds = [
    ...new Set(
      attempts
        .map((attempt) => attempt.userId)
        .filter((userId): userId is number => userId !== null)
    )
  ];
  const participantsById = await fetchParticipantsByIds(participantIds);

  const header = [
    "survey_id",
    "survey_title",
    "attempt_id",
    "participant_email",
    "participant_email_status",
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
    "other_text",
    "hidden_tags",
    "review_tags",
    "on_final_path"
  ];
  const rows: CsvFieldValue[][] = [];

  for (const attempt of attempts) {
    const participant = attempt.userId
      ? participantsById.get(attempt.userId)
      : buildAnonymousParticipant(attempt.anonymousContactEmail);
    const answers = buildAdminAttemptAnswers(survey, attempt, reviewTagsByAnswerId);

    for (const answer of answers) {
      if (answer.state === "not_reached") {
        continue;
      }

      rows.push([
        survey.id,
        survey.title,
        attempt.id,
        participant?.email ?? "",
        participant ? participantEmailStatus(participant) : "",
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
        answer.otherText,
        [
          ...answer.selectedOptions.flatMap((option) =>
            option.hiddenTags.map((tag) => `${tag.tagKey}=${tag.tagValue}`)
          ),
          ...answer.otherTags.map((tag) => `${tag.tagKey}=${tag.tagValue}`),
          ...answer.valueTags.map((tag) => `${tag.tagKey}=${tag.tagValue}`)
        ].join("; "),
        answer.reviewTags.map((tag) => `${tag.tagKey}=${tag.tagValue}`).join("; "),
        answer.onFinalPath
      ]);
    }
  }

  return {
    filename: `survey-${survey.id}-responses.csv`,
    content: buildCsv(header, rows)
  };
}

// Resolves the set of questions revealed on the attempt's final path, using the
// same page resolver the participant runtime uses (resolveProgressivePageState).
// This matches Phase 14 pruning, which deletes off-path answers via the same
// resolver, and correctly models page jumps (JUMP_TO_PAGE) and page-level
// normal-flow exclusions that the question-level walker does not — so a
// page-branch question that was never reached is reported off the final path
// rather than mislabelled as on it. With pruning in place, answered off-path
// rows no longer exist; this flag is the safety net for any that escape pruning
// plus the never-reached projection states.
export function collectFinalPathQuestionIds(
  survey: Survey,
  responsesByQuestionId: Map<number, SurveyResponseAnswer>
): Set<number> {
  const { visibleQuestionIdsByPageId } = resolveProgressivePageState(survey, [
    ...responsesByQuestionId.values()
  ]);

  return new Set(Object.values(visibleQuestionIdsByPageId).flat());
}

export function buildAdminAttemptAnswers(
  survey: Survey,
  attempt: SurveyAttempt,
  reviewTagsByAnswerId: Map<number, AdminAttemptReviewTag[]> = new Map(),
  reviewTagGroupIdsByAnswerId: Map<number, number[]> = new Map()
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
      responseAnswerId: response?.id ?? null,
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
      otherText: response?.otherText ?? null,
      otherTags: response?.otherText
        ? (question.otherTags ?? []).map((tag) => ({ tagKey: tag.tagKey, tagValue: tag.tagValue }))
        : [],
      valueTags: (question.valueTags ?? [])
        .filter((valueTag) => valueTagMatchesResponse(question, valueTag, response))
        .map((valueTag) => ({ tagKey: valueTag.tagKey, tagValue: valueTag.tagValue })),
      reviewTags: response ? (reviewTagsByAnswerId.get(response.id) ?? []) : [],
      reviewTagGroupIds: response ? (reviewTagGroupIdsByAnswerId.get(response.id) ?? []) : [],
      onFinalPath: finalPathQuestionIds.has(question.id)
    };
  });
}

export async function addResponseAnswerReviewTag(input: {
  answerId: number;
  assignedByUserId: number;
  attemptId: number;
  surveyId: number;
  tagDefinitionId: number;
}): Promise<ReviewTagMutationResult> {
  const validation = await validateReviewTagMutationTarget(input);

  if (!validation.ok) {
    return validation;
  }

  const tagValidation = await validateReviewTagDefinition(input.tagDefinitionId);

  if (!tagValidation.ok) {
    return tagValidation;
  }

  await pool.query(
    `insert into response_answer_tags (answer_id, tag_definition_id, assigned_by, is_manual)
     values ($1, $2, $3, true)
     on conflict (answer_id, tag_definition_id) do update
       set is_manual = true`,
    [input.answerId, input.tagDefinitionId, input.assignedByUserId]
  );

  return { ok: true, ...(await fetchReviewTagMutationPayload(input.answerId)) };
}

export async function addResponseAnswerReviewTagCategory(input: {
  answerId: number;
  assignedByUserId: number;
  attemptId: number;
  groupId: number;
  surveyId: number;
}): Promise<ReviewTagMutationResult> {
  const validation = await validateReviewTagMutationTarget(input);

  if (!validation.ok) {
    return validation;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    if (!(await reviewTagGroupExists(client, input.groupId))) {
      await client.query("rollback");
      return { ok: false, status: 404, error: "Tag category not found" };
    }

    await client.query(
      `insert into response_answer_tag_groups (answer_id, group_id, assigned_by)
       values ($1, $2, $3)
       on conflict (answer_id, group_id) do nothing`,
      [input.answerId, input.groupId, input.assignedByUserId]
    );

    await client.query(
      `insert into response_answer_tag_group_tags (
         answer_id,
         group_id,
         tag_definition_id,
         assigned_by
       )
       select $1, $2, tag_definitions.id, $3
       from tag_definitions
       where tag_definitions.group_id = $2
       on conflict (answer_id, group_id, tag_definition_id) do nothing`,
      [input.answerId, input.groupId, input.assignedByUserId]
    );

    await insertEffectiveReviewTagsFromCategorySources(client, {
      answerId: input.answerId,
      groupId: input.groupId
    });

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return { ok: true, ...(await fetchReviewTagMutationPayload(input.answerId)) };
}

export async function applyTagDefinitionToBoundReviewTagCategory(
  queryable: Queryable,
  input: { groupId: number; tagDefinitionId: number }
): Promise<void> {
  await queryable.query(
    `insert into response_answer_tag_group_tags (
       answer_id,
       group_id,
       tag_definition_id,
       assigned_by
     )
     select
       response_answer_tag_groups.answer_id,
       $2,
       $1,
       response_answer_tag_groups.assigned_by
     from response_answer_tag_groups
     where response_answer_tag_groups.group_id = $2
     on conflict (answer_id, group_id, tag_definition_id) do nothing`,
    [input.tagDefinitionId, input.groupId]
  );

  await insertEffectiveReviewTagsFromCategorySources(queryable, input);
}

export async function removeTagDefinitionFromBoundReviewTagCategory(
  queryable: Queryable,
  input: { groupId: number; tagDefinitionId: number }
): Promise<void> {
  await queryable.query(
    `delete from response_answer_tag_group_tags
     where group_id = $1
       and tag_definition_id = $2`,
    [input.groupId, input.tagDefinitionId]
  );

  await queryable.query(
    `delete from response_answer_tags
     where response_answer_tags.tag_definition_id = $1
       and response_answer_tags.is_manual = false
       and not exists (
         select 1
         from response_answer_tag_group_tags remaining_sources
         where remaining_sources.answer_id = response_answer_tags.answer_id
           and remaining_sources.tag_definition_id = response_answer_tags.tag_definition_id
       )`,
    [input.tagDefinitionId]
  );
}

async function insertEffectiveReviewTagsFromCategorySources(
  queryable: Queryable,
  input: { answerId?: number; groupId: number; tagDefinitionId?: number }
): Promise<void> {
  await queryable.query(
    `insert into response_answer_tags (
       answer_id,
       tag_definition_id,
       assigned_by,
       is_manual
     )
     select
       response_answer_tag_group_tags.answer_id,
       response_answer_tag_group_tags.tag_definition_id,
       response_answer_tag_group_tags.assigned_by,
       false
     from response_answer_tag_group_tags
     where response_answer_tag_group_tags.group_id = $1
       and ($2::int is null or response_answer_tag_group_tags.tag_definition_id = $2)
       and ($3::int is null or response_answer_tag_group_tags.answer_id = $3)
     on conflict (answer_id, tag_definition_id) do nothing`,
    [input.groupId, input.tagDefinitionId ?? null, input.answerId ?? null]
  );
}

export async function removeResponseAnswerReviewTag(input: {
  answerId: number;
  attemptId: number;
  surveyId: number;
  tagDefinitionId: number;
}): Promise<ReviewTagMutationResult> {
  const validation = await validateReviewTagMutationTarget(input);

  if (!validation.ok) {
    return validation;
  }

  const tagValidation = await validateReviewTagDefinition(input.tagDefinitionId);

  if (!tagValidation.ok) {
    return tagValidation;
  }

  await pool.query(
    `update response_answer_tags
     set is_manual = false
     where answer_id = $1
       and tag_definition_id = $2`,
    [input.answerId, input.tagDefinitionId]
  );

  await deleteOrphanedInheritedReviewTag(pool, {
    answerId: input.answerId,
    tagDefinitionId: input.tagDefinitionId
  });

  return { ok: true, ...(await fetchReviewTagMutationPayload(input.answerId)) };
}

export async function removeResponseAnswerReviewTagCategory(input: {
  answerId: number;
  attemptId: number;
  groupId: number;
  surveyId: number;
}): Promise<ReviewTagMutationResult> {
  const validation = await validateReviewTagMutationTarget(input);

  if (!validation.ok) {
    return validation;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    if (!(await reviewTagGroupExists(client, input.groupId))) {
      await client.query("rollback");
      return { ok: false, status: 404, error: "Tag category not found" };
    }

    const sourceResult = await client.query<{ tag_definition_id: number }>(
      `select tag_definition_id
       from response_answer_tag_group_tags
       where answer_id = $1
         and group_id = $2`,
      [input.answerId, input.groupId]
    );

    await client.query(
      `delete from response_answer_tag_groups
       where answer_id = $1
         and group_id = $2`,
      [input.answerId, input.groupId]
    );

    for (const source of sourceResult.rows) {
      await deleteOrphanedInheritedReviewTag(client, {
        answerId: input.answerId,
        tagDefinitionId: source.tag_definition_id
      });
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return { ok: true, ...(await fetchReviewTagMutationPayload(input.answerId)) };
}

async function deleteOrphanedInheritedReviewTag(
  queryable: Queryable,
  input: { answerId: number; tagDefinitionId: number }
): Promise<void> {
  await queryable.query(
    `delete from response_answer_tags
     where answer_id = $1
       and tag_definition_id = $2
       and is_manual = false
       and not exists (
         select 1
         from response_answer_tag_group_tags
         where response_answer_tag_group_tags.answer_id = response_answer_tags.answer_id
           and response_answer_tag_group_tags.tag_definition_id = response_answer_tags.tag_definition_id
       )`,
    [input.answerId, input.tagDefinitionId]
  );
}

async function reviewTagGroupExists(queryable: Queryable, groupId: number): Promise<boolean> {
  const groupResult = await queryable.query<{ exists: boolean }>(
    `select exists (
       select 1
       from tag_groups
       where id = $1
     ) as exists`,
    [groupId]
  );

  return groupResult.rows[0]?.exists ?? false;
}

async function validateReviewTagMutationTarget(input: {
  answerId: number;
  attemptId: number;
  surveyId: number;
}): Promise<
  | { ok: true }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 400; error: string }
> {
  const answerResult = await pool.query<{
    answer_text: string | null;
    question_type: string;
  }>(
    `select
       survey_response_answers.answer_text,
       survey_questions.question_type
     from survey_response_answers
     join survey_attempts
       on survey_attempts.id = survey_response_answers.survey_attempt_id
      and survey_attempts.id = $2
      and survey_attempts.survey_id = $1
     join survey_questions
       on survey_questions.id = survey_response_answers.question_id
      and survey_questions.survey_id = survey_attempts.survey_id
     where survey_response_answers.id = $3`,
    [input.surveyId, input.attemptId, input.answerId]
  );
  const answer = answerResult.rows[0];

  if (!answer) {
    return { ok: false, status: 404, error: "Survey answer not found" };
  }

  if (answer.question_type !== "text" || !answer.answer_text?.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Review tags can only be applied to answered text responses"
    };
  }

  return { ok: true };
}

async function validateReviewTagDefinition(
  tagDefinitionId: number
): Promise<{ ok: true } | { ok: false; status: 404; error: string }> {
  const tagResult = await pool.query<{ exists: boolean }>(
    `select exists (
       select 1
       from tag_definitions
       where id = $1
     ) as exists`,
    [tagDefinitionId]
  );

  if (!tagResult.rows[0]?.exists) {
    return { ok: false, status: 404, error: "Tag definition not found" };
  }

  return { ok: true };
}

async function fetchReviewTagMutationPayload(
  answerId: number
): Promise<{ reviewTagGroupIds: number[]; reviewTags: AdminAttemptReviewTag[] }> {
  const [reviewTagsByAnswerId, reviewTagGroupIdsByAnswerId] = await Promise.all([
    fetchReviewTagsByAnswerIds([answerId]),
    fetchReviewTagGroupIdsByAnswerIds([answerId])
  ]);

  return {
    reviewTags: reviewTagsByAnswerId.get(answerId) ?? [],
    reviewTagGroupIds: reviewTagGroupIdsByAnswerId.get(answerId) ?? []
  };
}

async function fetchReviewTagsByAnswerIds(
  answerIds: number[]
): Promise<Map<number, AdminAttemptReviewTag[]>> {
  if (answerIds.length === 0) {
    return new Map();
  }

  const result = await pool.query<ResponseAnswerTagRecord>(
    `select
       response_answer_tags.id,
       response_answer_tags.answer_id,
       response_answer_tags.tag_definition_id,
       tag_definitions.tag_key,
       tag_definitions.tag_value,
       response_answer_tags.is_manual,
       response_answer_tags.assigned_by,
       response_answer_tags.created_at
     from response_answer_tags
     join tag_definitions
       on tag_definitions.id = response_answer_tags.tag_definition_id
     where response_answer_tags.answer_id = any($1::int[])
     order by response_answer_tags.answer_id, tag_definitions.tag_key, tag_definitions.tag_value, response_answer_tags.id`,
    [answerIds]
  );
  const tagsByAnswerId = new Map<number, AdminAttemptReviewTag[]>();

  for (const row of result.rows) {
    const tags = tagsByAnswerId.get(row.answer_id) ?? [];
    tags.push(mapResponseAnswerTagRecord(row));
    tagsByAnswerId.set(row.answer_id, tags);
  }

  return tagsByAnswerId;
}

async function fetchReviewTagGroupIdsByAnswerIds(answerIds: number[]): Promise<Map<number, number[]>> {
  if (answerIds.length === 0) {
    return new Map();
  }

  const result = await pool.query<{ answer_id: number; group_id: number }>(
    `select answer_id, group_id
     from response_answer_tag_groups
     where answer_id = any($1::int[])
     order by answer_id, group_id`,
    [answerIds]
  );
  const groupIdsByAnswerId = new Map<number, number[]>();

  for (const row of result.rows) {
    const groupIds = groupIdsByAnswerId.get(row.answer_id) ?? [];
    groupIds.push(row.group_id);
    groupIdsByAnswerId.set(row.answer_id, groupIds);
  }

  return groupIdsByAnswerId;
}

function mapResponseAnswerTagRecord(record: ResponseAnswerTagRecord): AdminAttemptReviewTag {
  return {
    id: record.id,
    tagDefinitionId: record.tag_definition_id,
    tagKey: record.tag_key,
    tagValue: record.tag_value,
    isManual: record.is_manual,
    assignedByUserId: record.assigned_by,
    createdAt: record.created_at.toISOString()
  };
}

function responseHasContent(response: SurveyResponseAnswer): boolean {
  return (
    Boolean(response.answerText?.trim()) ||
    response.answerInteger !== null ||
    response.selectedAnswerOptionIds.length > 0 ||
    Boolean(response.otherText?.trim())
  );
}

async function fetchAttemptsWithResponsesForSurvey(
  surveyId: number,
  attemptId?: number,
  range?: AttemptDateRange
): Promise<SurveyAttempt[]> {
  const values: unknown[] = [surveyId];
  let condition = "survey_attempts.survey_id = $1";

  if (attemptId !== undefined) {
    values.push(attemptId);
    condition += ` and survey_attempts.id = $${values.length}`;
  }

  condition += attemptRangeSql("survey_attempts", range, values);

  const attemptsResult = await pool.query<SurveyAttemptRecord>(
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

  return new Map(
    result.rows
      .filter((row): row is ParticipantRecord & { id: number } => row.id !== null)
      .map((row) => [row.id, mapParticipantRecord(row)])
  );
}

function mapParticipantRecord(record: ParticipantRecord): ReportParticipant {
  return {
    id: record.id ?? null,
    firstName: record.first_name ?? "",
    lastName: record.last_name ?? "",
    email: record.email ?? "",
    type: "user"
  };
}

function participantEmailStatus(participant: ReportParticipant): string {
  if (participant.type === "anonymous" && participant.email !== "Anonymous survey link") {
    return "unverified_follow_up";
  }

  return participant.type === "anonymous" ? "anonymous_no_email" : "verified_account";
}

function sortQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  return [...questions].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );
}
