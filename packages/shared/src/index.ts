export type UserRole = "user" | "admin";

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface AuthMeResponse {
  user: AuthUser;
}

export interface PasswordResetMessageResponse {
  message: string;
}

export interface UserProfile {
  contactNumber: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CurrentUserSurveyStats {
  available: number;
  inProgress: number;
  completed: number;
  lastActivityAt: string | null;
  completionRate: number;
}

export interface CurrentUserProfileResponse {
  user: AuthUser;
  profile: UserProfile;
  surveyStats: CurrentUserSurveyStats;
}

export interface UpdateCurrentUserProfileResponse {
  user: AuthUser;
  profile: UserProfile;
}

export type SurveyAttemptStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "abandoned";

export type SurveyStatus = "draft" | "published" | "retired";

export type SurveyQuestionType = "text" | "integer" | "single_select" | "multi_select" | "scale";

export const surveyQuestionTypeEstimateWeightsSeconds: Record<SurveyQuestionType, number> = {
  text: 15,
  integer: 10,
  single_select: 10,
  multi_select: 10,
  scale: 10
};

export function getSurveyQuestionTypeEstimateWeightSeconds(
  questionType: SurveyQuestionType
): number {
  return surveyQuestionTypeEstimateWeightsSeconds[questionType] ??
    surveyQuestionTypeEstimateWeightsSeconds.text;
}

export type ConditionalLogicConditionOperator = "equals" | "is_blank";

export type ConditionalLogicActionType =
  | "JUMP_TO_QUESTION"
  | "JUMP_TO_PAGE"
  | "SHOW_QUESTION"
  | "HIDE_QUESTION"
  | "HIDE_PAGE"
  | "END_SURVEY";

export interface AnswerTag {
  id: number;
  answerOptionId: number;
  tagKey: string;
  tagValue: string;
  emoji?: string | null;
  isManual?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type HiddenTagAllBindingTarget = "answer_option" | "question_other" | "question_value";

export interface HiddenTagAllBinding {
  id: number;
  targetType: HiddenTagAllBindingTarget;
  answerOptionId: number | null;
  questionId: number | null;
  integerMin: number | null;
  integerMax: number | null;
  tagKey: string;
  createdAt: string;
  updatedAt: string;
}

// Hidden tag conditioned on the respondent's entered value, for questions
// without answer options. Integer questions use the optional inclusive
// bounds; text questions have null bounds and match any non-blank answer.
// Admin-only — like answerTags, never sent to participants.
export interface QuestionValueTag {
  id: number;
  questionId: number;
  integerMin: number | null;
  integerMax: number | null;
  tagKey: string;
  tagValue: string;
  emoji?: string | null;
  isManual?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Hidden tags attached to the system-generated Other choice on a selection
// question. Admin-only — Other remains response text, not an answer option.
export interface QuestionOtherTag {
  id: number;
  questionId: number;
  tagKey: string;
  tagValue: string;
  emoji?: string | null;
  isManual?: boolean;
  createdAt: string;
  updatedAt: string;
}

// True when a saved response satisfies a value-tag's condition. Shared so
// reporting (SQL-side aggregate mirrors this) and per-attempt views agree.
export function valueTagMatchesResponse(
  question: Pick<SurveyQuestion, "questionType">,
  valueTag: Pick<QuestionValueTag, "integerMin" | "integerMax">,
  response: Pick<SurveyResponseAnswer, "answerText" | "answerInteger"> | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (question.questionType === "text") {
    return Boolean(response.answerText?.trim());
  }

  if (question.questionType === "integer") {
    if (response.answerInteger === null) {
      return false;
    }

    return (
      (valueTag.integerMin === null || response.answerInteger >= valueTag.integerMin) &&
      (valueTag.integerMax === null || response.answerInteger <= valueTag.integerMax)
    );
  }

  return false;
}

export interface AnswerOption {
  id: number;
  questionId: number;
  optionText: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  answerTags?: AnswerTag[];
  answerTagAllBindings?: HiddenTagAllBinding[];
}

export interface SurveyQuestion {
  id: number;
  surveyId: number;
  pageId: number;
  questionText: string;
  questionType: SurveyQuestionType;
  allowOther: boolean;
  scaleMin: number | null;
  scaleMax: number | null;
  displayOrder: number;
  isRequired: boolean;
  helpText: string | null;
  createdAt: string;
  updatedAt: string;
  answerOptions: AnswerOption[];
  // Populated for admins only, mirroring answerTags on options.
  valueTags?: QuestionValueTag[];
  valueTagAllBindings?: HiddenTagAllBinding[];
  // Populated for admins only when Allow Other is enabled on selection questions.
  otherTags?: QuestionOtherTag[];
  otherTagAllBindings?: HiddenTagAllBinding[];
}

export interface ConditionalLogicRule {
  id: number;
  surveyId: number;
  sourcePageId: number | null;
  sourceQuestionId: number;
  sourceAnswerOptionId: number | null;
  conditionOperator: ConditionalLogicConditionOperator;
  actionType: ConditionalLogicActionType;
  targetQuestionId: number | null;
  targetPageId: number | null;
  skipTargetInNormalFlow: boolean;
  // HIDE_PAGE only: when true, firing the trigger advances immediately to the
  // next visible page, leaving the rest of the trigger's page unanswered.
  advanceOnTrigger: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyPage {
  id: number;
  surveyId: number;
  title: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Survey {
  id: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  categoryId: number | null;
  categoryName: string | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  deletedAt: string | null;
  // Participant-safe survey-level completion estimate. Admin-only timing
  // audit fields are exposed separately through the Admin timing endpoint.
  effectiveEstimateSeconds: number;
  pages: SurveyPage[];
  // Flattened compatibility list sorted by page order, then question order.
  questions: SurveyQuestion[];
  conditionalLogicRules: ConditionalLogicRule[];
}

export type SurveyTimingEstimateSource = "admin_override" | "statistical" | "default";

export interface SurveyTimingSummary {
  derivedEstimateSeconds: number | null;
  defaultEstimateSeconds: number;
  adminOverrideSeconds: number | null;
  effectiveEstimateSeconds: number;
  sampleCount: number;
  estimateSource: SurveyTimingEstimateSource;
}

export interface SurveyTimingResponse {
  timing: SurveyTimingSummary;
}

export interface SurveyCategory {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyCategoriesResponse {
  categories: SurveyCategory[];
}

export interface SurveyCategoryResponse {
  category: SurveyCategory;
}

export interface TagDefinition {
  id: number;
  tagKey: string;
  tagValue: string;
  emoji: string | null;
  groupId: number | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagGroup {
  id: number;
  name: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagCatalogGroup extends TagGroup {
  tags: TagDefinition[];
}

export interface TagDefinitionsResponse {
  tags: TagDefinition[];
  groups: TagCatalogGroup[];
  ungroupedTags: TagDefinition[];
  ungroupedDisplayOrder: number;
}

export interface TagDefinitionResponse {
  tag: TagDefinition;
}

export interface TagGroupResponse {
  group: TagGroup;
}

export type GlossaryDefinitionSource = "manual" | "dictionary_suggested";

export interface AdminGlossaryAlias {
  id: number;
  glossaryEntryId: number;
  matchText: string;
  isCanonical: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminGlossaryEntry {
  id: number;
  canonicalTerm: string;
  definition: string;
  isEnabled: boolean;
  definitionSource: GlossaryDefinitionSource;
  sourceProvider: string | null;
  sourceReference: string | null;
  sourceLookupAt: string | null;
  createdAt: string;
  updatedAt: string;
  aliases: AdminGlossaryAlias[];
}

export interface AdminGlossaryEntriesResponse {
  entries: AdminGlossaryEntry[];
}

export interface AdminGlossaryEntryResponse {
  entry: AdminGlossaryEntry;
}

export type DictionaryLookupStatus =
  | "found"
  | "no_match"
  | "not_configured"
  | "provider_error"
  | "rate_limited";

export interface AdminDictionaryDefinitionSuggestion {
  definition: string;
  sourceProvider: string;
  sourceReference: string;
  sourceLookupAt: string;
}

export interface AdminDictionaryLookupResponse {
  term: string;
  status: DictionaryLookupStatus;
  providerLabel: string | null;
  suggestions: AdminDictionaryDefinitionSuggestion[];
  spellingSuggestions: string[];
  message: string;
}

export interface AdminGlossaryQuestionSearchAssessmentContext {
  id: number;
  title: string;
  status: SurveyStatus;
}

export interface AdminGlossaryQuestionSearchPageContext {
  id: number;
  title: string;
  displayOrder: number;
}

export interface AdminGlossaryQuestionSearchQuestionContext {
  id: number;
  questionText: string;
  displayOrder: number;
}

export interface AdminGlossaryQuestionSearchMatch {
  start: number;
  end: number;
}

export interface AdminGlossaryQuestionSearchResult {
  assessment: AdminGlossaryQuestionSearchAssessmentContext;
  page: AdminGlossaryQuestionSearchPageContext | null;
  question: AdminGlossaryQuestionSearchQuestionContext;
  match: AdminGlossaryQuestionSearchMatch;
}

export interface AdminGlossaryQuestionSearchResponse {
  query: string;
  minQueryLength: number;
  limit: number;
  results: AdminGlossaryQuestionSearchResult[];
}

export interface ParticipantGlossaryEntry {
  id: number;
  canonicalTerm: string;
  definition: string;
  matchStrings: string[];
}

export interface ParticipantGlossaryEntriesResponse {
  entries: ParticipantGlossaryEntry[];
}

export interface GlossaryTextMatch {
  kind: "glossary";
  text: string;
  entryId: number;
  canonicalTerm: string;
  definition: string;
  matchText: string;
}

export interface PlainTextMatch {
  kind: "text";
  text: string;
}

export type GlossaryTextSegment = GlossaryTextMatch | PlainTextMatch;

interface GlossaryMatchCandidate {
  entryId: number;
  canonicalTerm: string;
  definition: string;
  matchText: string;
  normalizedMatchText: string;
}

interface AcceptedGlossaryMatch extends GlossaryMatchCandidate {
  start: number;
  end: number;
}

export function buildGlossaryTextSegments(
  text: string,
  entries: ParticipantGlossaryEntry[]
): GlossaryTextSegment[] {
  if (!text || entries.length === 0) {
    return text ? [{ kind: "text", text }] : [];
  }

  const normalizedText = normalizeGlossaryMatchText(text);
  const candidates = buildGlossaryMatchCandidates(entries);

  if (candidates.length === 0) {
    return [{ kind: "text", text }];
  }

  const acceptedMatches: AcceptedGlossaryMatch[] = [];

  for (const candidate of candidates) {
    let searchFromIndex = 0;

    while (searchFromIndex < normalizedText.length) {
      const start = normalizedText.indexOf(candidate.normalizedMatchText, searchFromIndex);

      if (start === -1) {
        break;
      }

      const end = start + candidate.normalizedMatchText.length;

      if (
        hasGlossaryMatchBoundary(normalizedText, start, end, candidate.normalizedMatchText) &&
        !overlapsAcceptedGlossaryMatch(acceptedMatches, start, end)
      ) {
        acceptedMatches.push({ ...candidate, start, end });
      }

      searchFromIndex = start + 1;
    }
  }

  if (acceptedMatches.length === 0) {
    return [{ kind: "text", text }];
  }

  acceptedMatches.sort((left, right) => left.start - right.start || right.end - left.end);

  const segments: GlossaryTextSegment[] = [];
  let cursor = 0;

  for (const match of acceptedMatches) {
    if (match.start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.start) });
    }

    segments.push({
      kind: "glossary",
      text: text.slice(match.start, match.end),
      entryId: match.entryId,
      canonicalTerm: match.canonicalTerm,
      definition: match.definition,
      matchText: match.matchText
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }

  return segments;
}

function buildGlossaryMatchCandidates(
  entries: ParticipantGlossaryEntry[]
): GlossaryMatchCandidate[] {
  const candidatesByKey = new Map<string, GlossaryMatchCandidate>();

  for (const entry of entries) {
    for (const rawMatchText of entry.matchStrings) {
      const matchText = rawMatchText.trim();

      if (!matchText) {
        continue;
      }

      const normalizedMatchText = normalizeGlossaryMatchText(matchText);
      const key = `${normalizedMatchText}:${entry.id}`;

      if (candidatesByKey.has(key)) {
        continue;
      }

      candidatesByKey.set(key, {
        entryId: entry.id,
        canonicalTerm: entry.canonicalTerm,
        definition: entry.definition,
        matchText,
        normalizedMatchText
      });
    }
  }

  return [...candidatesByKey.values()].sort(
    (left, right) =>
      right.normalizedMatchText.length - left.normalizedMatchText.length ||
      left.normalizedMatchText.localeCompare(right.normalizedMatchText) ||
      left.entryId - right.entryId
  );
}

function normalizeGlossaryMatchText(value: string): string {
  // Phase 41 glossary entries are plain text; this keeps matching simple.
  // Locale-expanding case folds are a documented edge case for future i18n work.
  return value.toLowerCase();
}

function hasGlossaryMatchBoundary(
  text: string,
  start: number,
  end: number,
  matchText: string
): boolean {
  const firstMatchCharacter = matchText[0];
  const lastMatchCharacter = matchText.at(-1);

  if (
    firstMatchCharacter &&
    isGlossaryWordCharacter(firstMatchCharacter) &&
    start > 0 &&
    isGlossaryWordCharacter(text[start - 1])
  ) {
    return false;
  }

  if (
    lastMatchCharacter &&
    isGlossaryWordCharacter(lastMatchCharacter) &&
    end < text.length &&
    isGlossaryWordCharacter(text[end])
  ) {
    return false;
  }

  return true;
}

function isGlossaryWordCharacter(character: string): boolean {
  return /^[\p{L}\p{N}_]$/u.test(character);
}

function overlapsAcceptedGlossaryMatch(
  acceptedMatches: AcceptedGlossaryMatch[],
  start: number,
  end: number
): boolean {
  return acceptedMatches.some((match) => start < match.end && end > match.start);
}

export interface AdminUserSummary {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AdminUsersListResponse {
  users: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserRoleResponse {
  user: AdminUserSummary;
}

export interface AdminUserDetailResponse {
  user: AdminUserSummary;
  profile: UserProfile;
  surveyStats: CurrentUserSurveyStats;
}

export interface AdminUserPasswordResetResponse {
  message: string;
}

export type PerformanceTestRunStatus = "running" | "completed" | "failed" | "aborted";

export interface PerformanceTestRunSummary {
  id: number;
  runKey: string;
  scenario: string;
  targetBaseUrl: string;
  status: PerformanceTestRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  maxVus: number | null;
  peakRequestsPerSecond: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  errorRate: number | null;
  totalRequests: number | null;
  failedRequests: number | null;
  bottleneck: string | null;
  recommendation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceTestRunDetail extends PerformanceTestRunSummary {
  config: Record<string, unknown>;
  summary: Record<string, unknown>;
  reportMarkdown: string | null;
}

export interface PerformanceTestRunsListResponse {
  runs: PerformanceTestRunSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PerformanceTestRunDetailResponse {
  run: PerformanceTestRunDetail;
}

export type PerformanceTestSuiteStatus = "running" | "completed" | "failed" | "aborted";

export type PerformanceTestSampleSource =
  | "k6"
  | "sql"
  | "azure_app_service"
  | "azure_postgres"
  | "suite";

export interface PerformanceTestSuiteSummary {
  id: number;
  suiteKey: string;
  targetBaseUrl: string;
  status: PerformanceTestSuiteStatus;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  plannedProfiles: unknown[];
  plannedStages: unknown[];
  firstFailingProfile: string | null;
  firstFailingStage: string | null;
  firstFailingTargetVus: number | null;
  firstFailingCurrentVus: number | null;
  bottleneck: string | null;
  bottleneckConfidence: string | null;
  recommendation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceTestSuiteDetail extends PerformanceTestSuiteSummary {
  config: Record<string, unknown>;
  summary: Record<string, unknown>;
  reportMarkdown: string | null;
}

export interface PerformanceTestSuiteChildRunSummary extends PerformanceTestRunSummary {
  suiteId: number | null;
}

export interface PerformanceTestSampleSummary {
  id: number;
  suiteId: number;
  runId: number | null;
  source: PerformanceTestSampleSource;
  profile: string | null;
  scenario: string | null;
  stageLabel: string | null;
  targetVus: number | null;
  currentVus: number | null;
  sampledAt: string;
  elapsedSeconds: number | null;
  metrics: Record<string, unknown>;
  unavailableReason: string | null;
  caveat: string | null;
  createdAt: string;
}

export interface PerformanceTestSuitesListResponse {
  suites: PerformanceTestSuiteSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PerformanceTestSuiteDetailResponse {
  suite: PerformanceTestSuiteDetail;
  runs: PerformanceTestSuiteChildRunSummary[];
  samples: PerformanceTestSampleSummary[];
  sampleLimit: number;
}

export interface SoftwareReleaseNoteSection {
  heading: string;
  items: string[];
}

export interface SoftwareReleaseNote {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  sections: SoftwareReleaseNoteSection[];
}

export interface SoftwareReleaseNotesResponse {
  currentVersion: string;
  releases: SoftwareReleaseNote[];
}

export interface SurveyListResponse {
  surveys: Survey[];
}

export interface SurveyResponse {
  survey: Survey;
}

export type SurveyTemplateKind = "page" | "question";

export interface SurveyTemplateExcludedLogicLocator {
  pageId: number | null;
  pageTitle: string | null;
  questionId: number | null;
  questionText: string | null;
  answerOptionId: number | null;
  answerOptionText: string | null;
}

export interface SurveyTemplateExcludedLogicEntry {
  sourceRuleId: number;
  conditionLabel: string;
  actionLabel: string;
  source: SurveyTemplateExcludedLogicLocator;
  target: SurveyTemplateExcludedLogicLocator;
  crossesPageBoundary: boolean;
}

export interface SurveyPageTemplateSnapshotAnswerTag {
  tagKey: string;
  tagValue: string;
}

export interface SurveyPageTemplateSnapshotAnswerOption {
  optionText: string;
  displayOrder: number;
  answerTags: SurveyPageTemplateSnapshotAnswerTag[];
}

export interface SurveyPageTemplateSnapshotValueTag {
  integerMin: number | null;
  integerMax: number | null;
  tagKey: string;
  tagValue: string;
}

export interface SurveyPageTemplateSnapshotOtherTag {
  tagKey: string;
  tagValue: string;
}

export interface SurveyPageTemplateSnapshotQuestion {
  questionText: string;
  questionType: SurveyQuestionType;
  allowOther: boolean;
  scaleMin: number | null;
  scaleMax: number | null;
  displayOrder: number;
  isRequired: boolean;
  helpText: string | null;
  answerOptions: SurveyPageTemplateSnapshotAnswerOption[];
  valueTags: SurveyPageTemplateSnapshotValueTag[];
  otherTags: SurveyPageTemplateSnapshotOtherTag[];
}

export interface SurveyPageTemplateSnapshot {
  schemaVersion: number;
  kind: "page";
  page: {
    title: string;
    description: string | null;
    questions: SurveyPageTemplateSnapshotQuestion[];
  };
}

export interface SurveyQuestionTemplateSnapshot {
  schemaVersion: number;
  kind: "question";
  question: SurveyPageTemplateSnapshotQuestion;
}

export interface SurveyTemplateSummary {
  id: number;
  templateKind: SurveyTemplateKind;
  name: string;
  description: string | null;
  sourceEntityKind: string | null;
  sourceEntityId: number | null;
  sourceSurveyId: number | null;
  sourceSurveyTitle: string | null;
  sourcePageTitle: string | null;
  sourceQuestionTitle: string | null;
  payloadSchemaVersion: number;
  questionCount: number;
  excludedLogicCount: number;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyPageTemplateSummary extends SurveyTemplateSummary {
  templateKind: "page";
}

export interface SurveyQuestionTemplateSummary extends SurveyTemplateSummary {
  templateKind: "question";
}

export interface SurveyTemplateDetail extends SurveyTemplateSummary {
  page?: SurveyPageTemplateSnapshot["page"];
  question?: SurveyQuestionTemplateSnapshot["question"];
  excludedLogic: SurveyTemplateExcludedLogicEntry[];
}

export interface SurveyPageTemplateDetail extends SurveyPageTemplateSummary {
  page: SurveyPageTemplateSnapshot["page"];
  excludedLogic: SurveyTemplateExcludedLogicEntry[];
}

export interface SurveyQuestionTemplateDetail extends SurveyQuestionTemplateSummary {
  question: SurveyQuestionTemplateSnapshot["question"];
  excludedLogic: SurveyTemplateExcludedLogicEntry[];
}

export interface SurveyTemplatesResponse {
  templates: SurveyTemplateSummary[];
}

export interface SurveyTemplateResponse {
  template: SurveyTemplateDetail;
}

export interface SurveyPageTemplatesResponse {
  templates: SurveyPageTemplateSummary[];
}

export interface SurveyPageTemplateResponse {
  template: SurveyPageTemplateDetail;
}

export interface SurveyQuestionTemplatesResponse {
  templates: SurveyQuestionTemplateSummary[];
}

export interface SurveyQuestionTemplateResponse {
  template: SurveyQuestionTemplateDetail;
}

export interface SurveyResponseAnswer {
  id: number;
  surveyAttemptId: number;
  questionId: number;
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
  otherText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyAttempt {
  id: number;
  surveyId: number;
  userId: number | null;
  anonymousLinkId: number | null;
  anonymousContactEmail: string | null;
  status: SurveyAttemptStatus;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  responses: SurveyResponseAnswer[];
}

export type SurveyIssueProfileProgressStatus =
  | "empty"
  | "building"
  | "complete"
  | "complete_empty";

export interface SurveyIssueProfileProgress {
  fillPercent: number;
  identifiedCategoryCount: number;
  encounteredCategoryCount: number;
  status: SurveyIssueProfileProgressStatus;
}

export interface SurveyIssueProfileEmojiCollectionItem {
  emoji: string;
  count: number;
}

export interface SurveyIssueProfileEmojiCollection {
  items: SurveyIssueProfileEmojiCollectionItem[];
  totalCount: number;
}

export interface SurveyAttemptSummary {
  attempt: SurveyAttempt | null;
  survey: Survey;
}

export interface SurveyAttemptDetail {
  attempt: SurveyAttempt;
  survey: Survey;
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}

export interface SurveyAnswerRequestPayload {
  attemptId: number;
  questionId: number;
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
  isOtherSelected: boolean;
  otherText: string | null;
}

export interface SurveyPageAnswerRequestPayload {
  attemptId: number;
  answers: SurveyAnswerRequestPayload[];
}

export type SurveyAttemptActivityEventType =
  | "page_entry"
  | "answer_save"
  | "resume"
  | "completion"
  | "heartbeat";

export interface SurveyAttemptActivityRequestPayload {
  attemptId: number;
  eventType: SurveyAttemptActivityEventType;
  pageId: number | null;
  questionId: number | null;
  visibleQuestionIds: number[];
}

export interface SurveyAttemptActivityResponse {
  ok: true;
}

export interface MySurveysResponse {
  surveys: SurveyAttemptSummary[];
}

export interface MySurveyResponse {
  attempt: SurveyAttempt;
  survey: Survey;
  glossaryEntries: ParticipantGlossaryEntry[];
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}

export interface StartSurveyResponse {
  attempt: SurveyAttempt;
  survey: Survey;
  glossaryEntries: ParticipantGlossaryEntry[];
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}

export interface AnonymousSurveyLink {
  id: number;
  surveyId: number;
  enabled: boolean;
  listedInPublicDirectory: boolean;
  expiresAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  publicUrl?: string;
}

export interface AnonymousSurveyLinkWithUrl extends AnonymousSurveyLink {
  publicUrl: string;
}

export interface AnonymousSurveyLinksResponse {
  links: AnonymousSurveyLink[];
}

export interface CreateAnonymousSurveyLinkResponse {
  link: AnonymousSurveyLinkWithUrl;
}

export interface DisableAnonymousSurveyLinkResponse {
  link: AnonymousSurveyLink;
}

export interface RotateAnonymousSurveyLinkResponse {
  disabledLink: AnonymousSurveyLink;
  link: AnonymousSurveyLinkWithUrl;
}

export interface UpdateAnonymousSurveyLinkDirectoryListingResponse {
  link: AnonymousSurveyLink;
}

export interface AnonymousSurveyDirectoryItem {
  surveyTitle: string;
  surveyDescription: string | null;
  categoryName: string | null;
  expiresAt: string | null;
  listedAt: string;
  publicUrl: string;
}

export interface AnonymousSurveyDirectoryResponse {
  surveys: AnonymousSurveyDirectoryItem[];
}

export interface AnonymousSurveyResponse {
  survey: Survey;
}

export interface StartAnonymousSurveyResponse extends StartSurveyResponse {
  attemptAccessToken: string;
}

export interface AnswerSurveyResponse {
  attempt: SurveyAttempt;
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
  isCompleteReady: boolean;
}

export interface CompleteSurveyResponse {
  attempt: SurveyAttempt;
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
}

export interface ConvertAnonymousSurveyAttemptResponse {
  user: AuthUser;
  attempt: SurveyAttempt;
}

export interface HealthResponse {
  status: "ok" | "unavailable";
  app: "survey-portal";
  runEnv: "dev" | "prod";
  timestamp: string;
  database: "connected" | "unavailable" | "not_checked";
}

export interface ReportParticipant {
  id: number | null;
  firstName: string;
  lastName: string;
  email: string;
  type: "user" | "anonymous";
}

export interface SurveyReportOptionStat {
  answerOptionId: number;
  optionText: string;
  displayOrder: number;
  selectionCount: number;
}

export interface SurveyReportQuestionStat {
  questionId: number;
  displayOrder: number;
  questionText: string;
  questionType: SurveyQuestionType;
  isRequired: boolean;
  answeredCount: number;
  blankCount: number;
  // Present for option-backed questions (selects and scales); empty for
  // text and integer questions.
  optionStats: SurveyReportOptionStat[];
  // Counts saved custom "Other" responses separately from real answer options.
  otherResponseCount: number;
}

// Admin-only rollup of hidden tag pairs implied by participants' selected
// options. selectionCount totals option selections carrying the pair;
// respondentCount is distinct attempts, so multi-select double-picks and
// multiple tagged questions in one attempt count once.
export interface SurveyReportTagStat {
  tagKey: string;
  tagValue: string;
  selectionCount: number;
  respondentCount: number;
}

export interface SurveyReportSummary {
  surveyId: number;
  title: string;
  status: SurveyStatus;
  attemptCounts: {
    inProgress: number;
    completed: number;
    abandoned: number;
    total: number;
  };
  completionRate: number;
  questionStats: SurveyReportQuestionStat[];
  tagStats: SurveyReportTagStat[];
}

export interface SurveyReportResponse {
  report: SurveyReportSummary;
}

export interface AdminAttemptSummary {
  attemptId: number;
  participant: ReportParticipant;
  status: SurveyAttemptStatus;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  answeredCount: number;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SurveyAttemptsListResponse {
  surveyId: number;
  attempts: AdminAttemptSummary[];
  pagination: PaginationMetadata;
}

export interface AdminAttemptAnswerOption {
  answerOptionId: number;
  optionText: string;
  hiddenTags: { tagKey: string; tagValue: string }[];
}

export interface AdminAttemptReviewTag {
  id: number;
  tagDefinitionId: number;
  tagKey: string;
  tagValue: string;
  isManual: boolean;
  assignedByUserId: number | null;
  createdAt: string;
}

// answered: a meaningful response was saved.
// skipped_blank: a blank response row was intentionally saved for an
//   optional question.
// not_reached: no response row exists for this question.
export type AdminAttemptAnswerState = "answered" | "skipped_blank" | "not_reached";

export interface AdminAttemptAnswer {
  responseAnswerId: number | null;
  questionId: number;
  displayOrder: number;
  questionText: string;
  questionType: SurveyQuestionType;
  isRequired: boolean;
  state: AdminAttemptAnswerState;
  answerText: string | null;
  answerInteger: number | null;
  selectedOptions: AdminAttemptAnswerOption[];
  otherText: string | null;
  // Hidden tags attached to the question's system-generated Other choice.
  // Present only when otherText is non-null.
  otherTags: { tagKey: string; tagValue: string }[];
  // Hidden value tags whose condition this answer satisfies (text/integer
  // questions). Admin-only, like selectedOptions[].hiddenTags.
  valueTags: { tagKey: string; tagValue: string }[];
  // Manual Admin review tags applied to this specific saved response answer.
  // Admin-only and separate from automatic hidden/value/Other tags.
  reviewTags: AdminAttemptReviewTag[];
  // Category-level review tag bindings created by the virtual "apply all in
  // category" action. Admin-only; the group names are read from the tag
  // catalog when needed, not stored on the answer payload.
  reviewTagGroupIds: number[];
  // True when the question is revealed on the final path implied by the
  // attempt's saved answers. As of Phase 14, off-path answers are pruned at
  // save time, so this flag is a safety net: any answer that escaped pruning,
  // or a never-reached question, is reported as "not on final path".
  onFinalPath: boolean;
}

export interface AdminAttemptDetailResponse {
  surveyId: number;
  surveyTitle: string;
  participant: ReportParticipant;
  attempt: SurveyAttempt;
  answers: AdminAttemptAnswer[];
}

export interface UpdateResponseAnswerReviewTagsResponse {
  reviewTags: AdminAttemptReviewTag[];
  reviewTagGroupIds: number[];
}

export function resolveNextQuestion(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined,
  hiddenQuestionIds: ReadonlySet<number> = new Set()
): SurveyQuestion | null {
  // Only jump targets are statically excluded from the normal flow.
  // HIDE_QUESTION targets stay in the normal flow and are excluded per
  // attempt via hiddenQuestionIds once their trigger answer is given.
  const orderedQuestions = getOrderedQuestions(survey);
  const conditionalTargetQuestionIds = new Set(
    survey.conditionalLogicRules
      .filter((rule) => rule.actionType === "JUMP_TO_QUESTION" && rule.skipTargetInNormalFlow)
      .map((rule) => rule.targetQuestionId)
      .filter((targetQuestionId): targetQuestionId is number => targetQuestionId !== null)
  );
  const matchingRule = survey.conditionalLogicRules.find(
    (rule) =>
      rule.sourceQuestionId === question.id &&
      rule.actionType === "JUMP_TO_QUESTION" &&
      rule.targetQuestionId !== null &&
      doesRuleMatchResponse(rule, response)
  );

  const advanceFrom = (fromQuestion: SurveyQuestion): SurveyQuestion | null =>
    orderedQuestions
      .filter(
        (candidate) =>
          compareQuestionOrder(survey, candidate, fromQuestion) > 0 &&
          !conditionalTargetQuestionIds.has(candidate.id) &&
          !hiddenQuestionIds.has(candidate.id)
      )[0] ?? null;

  if (matchingRule?.targetQuestionId) {
    const target =
      survey.questions.find((candidate) => candidate.id === matchingRule.targetQuestionId) ?? null;

    // A jump target hidden by an active skip rule is bypassed: continue
    // forward from the target along the visible normal flow.
    if (target && hiddenQuestionIds.has(target.id)) {
      return advanceFrom(target);
    }

    return target;
  }

  return advanceFrom(question);
}

// Collects the questions hidden when the source question was just answered with
// the rule's trigger option: HIDE_QUESTION rules contribute their target
// question, while HIDE_PAGE rules expand to every question currently on the
// target page so a whole page is skipped through the same hidden-question set.
export function collectActivatedHiddenQuestionIds(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): number[] {
  const hiddenQuestionIds: number[] = [];

  for (const rule of survey.conditionalLogicRules) {
    if (rule.sourceQuestionId !== question.id || !doesRuleMatchResponse(rule, response)) {
      continue;
    }

    if (rule.actionType === "HIDE_QUESTION" && rule.targetQuestionId !== null) {
      hiddenQuestionIds.push(rule.targetQuestionId);
    } else if (rule.actionType === "HIDE_PAGE" && rule.targetPageId !== null) {
      for (const pageQuestion of getQuestionsForPage(survey, rule.targetPageId)) {
        hiddenQuestionIds.push(pageQuestion.id);
      }
    }
  }

  return hiddenQuestionIds;
}

// True when answering this question triggers a HIDE_PAGE rule marked
// advanceOnTrigger, meaning the runtime should leave the rest of the current
// page and jump straight to the next visible page.
export function hasActivatedAdvancingPageSkip(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): boolean {
  return survey.conditionalLogicRules.some(
    (rule) =>
      rule.actionType === "HIDE_PAGE" &&
      rule.advanceOnTrigger &&
      rule.targetPageId !== null &&
      rule.sourceQuestionId === question.id &&
      doesRuleMatchResponse(rule, response)
  );
}

export function doesRuleMatchResponse(
  rule: Pick<
    ConditionalLogicRule,
    "conditionOperator" | "sourceAnswerOptionId"
  >,
  response: SurveyResponseAnswer | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (rule.conditionOperator === "equals") {
    return (
      rule.sourceAnswerOptionId !== null &&
      response.selectedAnswerOptionIds.includes(rule.sourceAnswerOptionId)
    );
  }

  if (rule.conditionOperator === "is_blank") {
    return !response.answerText?.trim();
  }

  return false;
}

export interface AttemptPathResult {
  path: SurveyQuestion[];
  hasLoop: boolean;
}

// Walks the navigation path implied by the saved responses. Questions
// without a response project forward along the normal flow, so the result
// is the exact path for completed attempts and a best-known projection for
// attempts still in progress. Skip-logic targets excluded from the normal
// flow never appear unless a saved answer jumps to them.
export function resolveAttemptPath(
  survey: Survey,
  responses: SurveyResponseAnswer[]
): AttemptPathResult {
  const responsesByQuestionId = new Map(
    responses.map((response) => [response.questionId, response])
  );
  const path: SurveyQuestion[] = [];
  const visitedQuestionIds = new Set<number>();
  // Skip rules activate incrementally along the walked path, so answers on
  // questions the walk never visits (stale off-path data) hide nothing, and
  // a hide can only ever affect questions after its source.
  const activeHiddenQuestionIds = new Set<number>();
  let question: SurveyQuestion | null = getOrderedQuestions(survey)[0] ?? null;

  while (question) {
    if (visitedQuestionIds.has(question.id)) {
      return { path, hasLoop: true };
    }

    visitedQuestionIds.add(question.id);
    path.push(question);

    const response = responsesByQuestionId.get(question.id);

    for (const hiddenQuestionId of collectActivatedHiddenQuestionIds(survey, question, response)) {
      activeHiddenQuestionIds.add(hiddenQuestionId);
    }

    question = resolveNextQuestion(survey, question, response, activeHiddenQuestionIds);
  }

  return { path, hasLoop: false };
}

export interface AttemptPagePathResult {
  path: SurveyPage[];
  visibleQuestionIdsByPageId: Record<number, number[]>;
  hasLoop: boolean;
}

export interface ProgressivePageState extends AttemptPagePathResult {
  currentPage: SurveyPage | null;
  currentQuestion: SurveyQuestion | null;
  currentPageQuestionIds: number[];
}

export interface SurveyRemainingTimeEstimate {
  copy: string;
  remainingPathWeightSeconds: number;
  remainingQuestionIds: number[];
  remainingSeconds: number;
  totalEstimateSeconds: number;
  totalPathWeightSeconds: number;
}

export function calculateSurveyRemainingTimeEstimate(input: {
  currentPageId: number | null;
  pagePath?: AttemptPagePathResult;
  responses: SurveyResponseAnswer[];
  survey: Survey;
}): SurveyRemainingTimeEstimate {
  const pagePath = input.pagePath ?? resolveAttemptPagePath(input.survey, input.responses);
  const questionsById = new Map(input.survey.questions.map((question) => [question.id, question]));
  const responsesByQuestionId = new Map(
    input.responses.map((response) => [response.questionId, response])
  );
  const pathPageIds = pagePath.path.map((page) => page.id);
  const currentPageIndex =
    input.currentPageId === null ? pathPageIds.length : pathPageIds.indexOf(input.currentPageId);
  const firstRemainingPageIndex = currentPageIndex >= 0 ? currentPageIndex : 0;
  const totalQuestionIds = uniqueNumbers(
    pagePath.path.flatMap((page) => pagePath.visibleQuestionIdsByPageId[page.id] ?? [])
  );
  const remainingQuestionIds = uniqueNumbers(
    pagePath.path.flatMap((page, pageIndex) => {
      if (pageIndex < firstRemainingPageIndex) {
        return [];
      }

      const visibleQuestionIds = pagePath.visibleQuestionIdsByPageId[page.id] ?? [];

      if (page.id !== input.currentPageId) {
        return visibleQuestionIds;
      }

      return visibleQuestionIds.filter((questionId) => {
        const question = questionsById.get(questionId);

        return question
          ? !hasProgressiveResponseForQuestion(question, responsesByQuestionId.get(questionId))
          : false;
      });
    })
  );
  const totalPathWeightSeconds = sumQuestionWeights(totalQuestionIds, questionsById);
  const remainingPathWeightSeconds = sumQuestionWeights(remainingQuestionIds, questionsById);
  const totalEstimateSeconds = Math.max(1, Math.round(input.survey.effectiveEstimateSeconds));
  const remainingSeconds =
    totalPathWeightSeconds > 0 && remainingPathWeightSeconds > 0
      ? Math.min(
          totalEstimateSeconds,
          Math.max(
            1,
            Math.round((remainingPathWeightSeconds / totalPathWeightSeconds) * totalEstimateSeconds)
          )
        )
      : 0;

  return {
    copy: formatRemainingTimeCopy(remainingSeconds),
    remainingPathWeightSeconds,
    remainingQuestionIds,
    remainingSeconds,
    totalEstimateSeconds,
    totalPathWeightSeconds
  };
}

export function calculateSurveyIssueProfileProgress(input: {
  attemptStatus: SurveyAttemptStatus;
  responses: SurveyResponseAnswer[];
  survey: Survey;
}): SurveyIssueProfileProgress {
  const state = resolveProgressivePageState(input.survey, input.responses);
  const visibleQuestionIds = new Set(Object.values(state.visibleQuestionIdsByPageId).flat());
  const encounteredQuestionIds = collectEncounteredIssueProfileQuestionIds(
    state,
    input.attemptStatus
  );
  const responsesByQuestionId = new Map(
    input.responses.map((response) => [response.questionId, response])
  );
  const identifiedCategoryKeys = new Set<string>();
  const encounteredCategoryKeys = new Set<string>();

  for (const question of input.survey.questions) {
    if (encounteredQuestionIds.has(question.id)) {
      for (const tagKey of collectConfiguredIssueCategoryKeys(question)) {
        encounteredCategoryKeys.add(tagKey);
      }
    }

    if (!visibleQuestionIds.has(question.id)) {
      continue;
    }

    const response = responsesByQuestionId.get(question.id);

    if (!response) {
      continue;
    }

    for (const tagKey of collectIdentifiedIssueCategoryKeys(question, response)) {
      identifiedCategoryKeys.add(tagKey);
      encounteredCategoryKeys.add(tagKey);
    }
  }

  const identifiedCategoryCount = identifiedCategoryKeys.size;
  const encounteredCategoryCount = encounteredCategoryKeys.size;
  const isCompleted = input.attemptStatus === "completed";
  const status: SurveyIssueProfileProgressStatus =
    identifiedCategoryCount === 0
      ? isCompleted
        ? "complete_empty"
        : "empty"
      : isCompleted
        ? "complete"
        : "building";

  if (identifiedCategoryCount === 0) {
    return {
      fillPercent: 0,
      identifiedCategoryCount,
      encounteredCategoryCount,
      status
    };
  }

  if (isCompleted) {
    return {
      fillPercent: 100,
      identifiedCategoryCount,
      encounteredCategoryCount,
      status
    };
  }

  const pathProgressPercent = calculateIssueProfilePathProgressPercent(
    input.survey,
    state,
    input.responses
  );
  const discoveryRatio = identifiedCategoryCount / Math.max(1, encounteredCategoryCount);
  const fillPercent = Math.min(
    94,
    Math.max(0, Math.round(pathProgressPercent * 0.7 + discoveryRatio * 30))
  );

  return {
    fillPercent,
    identifiedCategoryCount,
    encounteredCategoryCount,
    status
  };
}

export function calculateSurveyIssueProfileEmojiCollection(input: {
  responses: SurveyResponseAnswer[];
  survey: Survey;
}): SurveyIssueProfileEmojiCollection {
  const state = resolveProgressivePageState(input.survey, input.responses);
  const visibleQuestionIds = new Set(Object.values(state.visibleQuestionIdsByPageId).flat());
  const responsesByQuestionId = new Map(
    input.responses.map((response) => [response.questionId, response])
  );
  const countsByEmoji = new Map<string, number>();

  for (const question of input.survey.questions) {
    if (!visibleQuestionIds.has(question.id)) {
      continue;
    }

    const response = responsesByQuestionId.get(question.id);

    if (!response) {
      continue;
    }

    for (const emoji of collectIdentifiedIssueProfileEmojis(question, response)) {
      countsByEmoji.set(emoji, (countsByEmoji.get(emoji) ?? 0) + 1);
    }
  }

  const items = [...countsByEmoji.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji));

  return {
    items,
    totalCount: items.reduce((total, item) => total + item.count, 0)
  };
}

function collectEncounteredIssueProfileQuestionIds(
  state: ProgressivePageState,
  attemptStatus: SurveyAttemptStatus
): Set<number> {
  if (attemptStatus === "completed" || !state.currentPage) {
    return new Set(Object.values(state.visibleQuestionIdsByPageId).flat());
  }

  const encounteredQuestionIds = new Set<number>();

  for (const page of state.path) {
    for (const questionId of state.visibleQuestionIdsByPageId[page.id] ?? []) {
      encounteredQuestionIds.add(questionId);
    }

    if (page.id === state.currentPage.id) {
      break;
    }
  }

  return encounteredQuestionIds;
}

function collectConfiguredIssueCategoryKeys(question: SurveyQuestion): string[] {
  return [
    ...question.answerOptions.flatMap((option) =>
      (option.answerTags ?? []).map((tag) => tag.tagKey)
    ),
    ...(question.otherTags ?? []).map((tag) => tag.tagKey),
    ...(question.valueTags ?? []).map((tag) => tag.tagKey)
  ];
}

function collectIdentifiedIssueCategoryKeys(
  question: SurveyQuestion,
  response: SurveyResponseAnswer
): string[] {
  const selectedOptionIds = new Set(response.selectedAnswerOptionIds);
  const selectedOptionTagKeys = question.answerOptions
    .filter((option) => selectedOptionIds.has(option.id))
    .flatMap((option) => (option.answerTags ?? []).map((tag) => tag.tagKey));
  const otherTagKeys = response.otherText?.trim()
    ? (question.otherTags ?? []).map((tag) => tag.tagKey)
    : [];
  const valueTagKeys = (question.valueTags ?? [])
    .filter((valueTag) => valueTagMatchesResponse(question, valueTag, response))
    .map((tag) => tag.tagKey);

  return [...selectedOptionTagKeys, ...otherTagKeys, ...valueTagKeys];
}

function collectIdentifiedIssueProfileEmojis(
  question: SurveyQuestion,
  response: SurveyResponseAnswer
): string[] {
  const selectedOptionIds = new Set(response.selectedAnswerOptionIds);
  const selectedOptionEmojis = question.answerOptions
    .filter((option) => selectedOptionIds.has(option.id))
    .flatMap((option) => (option.answerTags ?? []).map((tag) => tag.emoji));
  const otherEmojis = response.otherText?.trim()
    ? (question.otherTags ?? []).map((tag) => tag.emoji)
    : [];
  const valueEmojis = (question.valueTags ?? [])
    .filter((valueTag) => valueTagMatchesResponse(question, valueTag, response))
    .map((tag) => tag.emoji);

  return [...selectedOptionEmojis, ...otherEmojis, ...valueEmojis].flatMap((emoji) => {
    const normalizedEmoji = emoji?.trim();
    return normalizedEmoji ? [normalizedEmoji] : [];
  });
}

function calculateIssueProfilePathProgressPercent(
  survey: Survey,
  state: ProgressivePageState,
  responses: SurveyResponseAnswer[]
): number {
  const visibleQuestionIds = uniqueNumbers(Object.values(state.visibleQuestionIdsByPageId).flat());

  if (visibleQuestionIds.length === 0) {
    return 0;
  }

  const questionsById = new Map(survey.questions.map((question) => [question.id, question]));
  const responsesByQuestionId = new Map(responses.map((response) => [response.questionId, response]));
  const answeredCount = visibleQuestionIds.filter((questionId) => {
    const question = questionsById.get(questionId);

    return question
      ? hasProgressiveResponseForQuestion(question, responsesByQuestionId.get(questionId))
      : false;
  }).length;

  return Math.max(0, Math.min(100, (answeredCount / visibleQuestionIds.length) * 100));
}

export function formatRemainingTimeCopy(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(remainingSeconds));

  if (safeSeconds <= 15) {
    return "Almost done";
  }

  if (safeSeconds < 60) {
    return "Less than 1 min remaining";
  }

  const minutes = Math.max(1, Math.round(safeSeconds / 60));

  return `About ${minutes} min remaining`;
}

export function resolveAttemptPagePath(
  survey: Survey,
  responses: SurveyResponseAnswer[]
): AttemptPagePathResult {
  const state = resolveProgressivePageState(survey, responses);

  return {
    path: state.path,
    visibleQuestionIdsByPageId: state.visibleQuestionIdsByPageId,
    hasLoop: state.hasLoop
  };
}

export function resolveProgressivePageState(
  survey: Survey,
  responses: SurveyResponseAnswer[]
): ProgressivePageState {
  const responsesByQuestionId = new Map(
    responses.map((response) => [response.questionId, response])
  );
  const path: SurveyPage[] = [];
  const visibleQuestionIdsByPageId: Record<number, number[]> = {};
  const visitedPageIds = new Set<number>();
  const activeHiddenQuestionIds = new Set<number>();
  const normalFlowExcludedQuestionIds = getNormalFlowExcludedQuestionIds(survey);
  const jumpedToPageIds = new Set<number>();
  let page: SurveyPage | null = getOrderedPages(survey)[0] ?? null;

  pageLoop:
  while (page) {
    if (visitedPageIds.has(page.id)) {
      return {
        path,
        visibleQuestionIdsByPageId,
        currentPage: null,
        currentQuestion: null,
        currentPageQuestionIds: [],
        hasLoop: true
      };
    }

    visitedPageIds.add(page.id);
    path.push(page);

    const revealedQuestionIds: number[] = [];
    const wasReachedByJump = jumpedToPageIds.has(page.id);

    for (const question of getQuestionsForPage(survey, page.id)) {
      if (
        activeHiddenQuestionIds.has(question.id) ||
        (!wasReachedByJump && normalFlowExcludedQuestionIds.has(question.id))
      ) {
        continue;
      }

      revealedQuestionIds.push(question.id);
      const response = responsesByQuestionId.get(question.id);

      if (!hasProgressiveResponseForQuestion(question, response)) {
        visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
        appendProjectedPagePath(
          survey,
          page,
          activeHiddenQuestionIds,
          visitedPageIds,
          path,
          visibleQuestionIdsByPageId
        );

        return {
          path,
          visibleQuestionIdsByPageId,
          currentPage: page,
          currentQuestion: question,
          currentPageQuestionIds: revealedQuestionIds,
          hasLoop: false
        };
      }

      for (const hiddenQuestionId of collectActivatedHiddenQuestionIds(survey, question, response)) {
        activeHiddenQuestionIds.add(hiddenQuestionId);
      }

      const navigationTarget = resolveTriggeredNavigationPage(
        survey,
        page,
        responsesByQuestionId,
        activeHiddenQuestionIds,
        revealedQuestionIds
      );

      if (navigationTarget) {
        visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
        jumpedToPageIds.add(navigationTarget.id);
        page = navigationTarget;
        continue pageLoop;
      }

      // An "advance on trigger" HIDE_PAGE rule behaves like a jump: stop
      // revealing the rest of this page and move to the next visible page,
      // which getNextVisiblePage skips past the just-hidden target page(s).
      if (hasActivatedAdvancingPageSkip(survey, question, response)) {
        visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
        page = getNextVisiblePage(survey, page, activeHiddenQuestionIds);
        continue pageLoop;
      }
    }

    visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
    page = getNextVisiblePage(survey, page, activeHiddenQuestionIds);
  }

  return {
    path,
    visibleQuestionIdsByPageId,
    currentPage: null,
    currentQuestion: null,
    currentPageQuestionIds: [],
    hasLoop: false
  };
}

export function getOrderedPages(survey: Survey): SurveyPage[] {
  return [...survey.pages].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );
}

export function getOrderedQuestions(survey: Survey): SurveyQuestion[] {
  const pageOrderById = new Map(
    getOrderedPages(survey).map((page, index) => [page.id, index])
  );

  return [...survey.questions].sort((left, right) => {
    const pageOrder =
      (pageOrderById.get(left.pageId) ?? Number.MAX_SAFE_INTEGER) -
      (pageOrderById.get(right.pageId) ?? Number.MAX_SAFE_INTEGER);

    return pageOrder || left.displayOrder - right.displayOrder || left.id - right.id;
  });
}

export function getQuestionsForPage(survey: Survey, pageId: number): SurveyQuestion[] {
  return getOrderedQuestions(survey).filter((question) => question.pageId === pageId);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function sumQuestionWeights(
  questionIds: number[],
  questionsById: ReadonlyMap<number, SurveyQuestion>
): number {
  return questionIds.reduce((sum, questionId) => {
    const question = questionsById.get(questionId);

    return question
      ? sum + getSurveyQuestionTypeEstimateWeightSeconds(question.questionType)
      : sum;
  }, 0);
}

function compareQuestionOrder(
  survey: Survey,
  left: SurveyQuestion,
  right: SurveyQuestion
): number {
  const orderedIds = getOrderedQuestions(survey).map((question) => question.id);

  return orderedIds.indexOf(left.id) - orderedIds.indexOf(right.id);
}

function getNextVisiblePage(
  survey: Survey,
  page: SurveyPage,
  hiddenQuestionIds: ReadonlySet<number>
): SurveyPage | null {
  const orderedPages = getOrderedPages(survey);
  const currentIndex = orderedPages.findIndex((candidate) => candidate.id === page.id);
  const normalFlowExcludedPageIds = getNormalFlowExcludedPageIds(survey);
  const normalFlowExcludedQuestionIds = getNormalFlowExcludedQuestionIds(survey);

  if (currentIndex < 0) {
    return null;
  }

  return (
    orderedPages.slice(currentIndex + 1).find((candidate) =>
      !normalFlowExcludedPageIds.has(candidate.id) &&
      getQuestionsForPage(survey, candidate.id).some(
        (question) =>
          !hiddenQuestionIds.has(question.id) &&
          !normalFlowExcludedQuestionIds.has(question.id)
      )
    ) ?? null
  );
}

function getVisibleTargetPage(
  survey: Survey,
  page: SurveyPage,
  hiddenQuestionIds: ReadonlySet<number>
): SurveyPage | null {
  const hasVisibleQuestion = getQuestionsForPage(survey, page.id).some(
    (question) => !hiddenQuestionIds.has(question.id)
  );

  return hasVisibleQuestion ? page : getNextVisiblePage(survey, page, hiddenQuestionIds);
}

function resolveTriggeredNavigationPage(
  survey: Survey,
  page: SurveyPage,
  responsesByQuestionId: ReadonlyMap<number, SurveyResponseAnswer>,
  hiddenQuestionIds: ReadonlySet<number>,
  sourceQuestionIds: readonly number[]
): SurveyPage | null {
  const orderedPages = getOrderedPages(survey);
  const currentPageIndex = orderedPages.findIndex((candidate) => candidate.id === page.id);
  const sourceQuestionIdSet = new Set(sourceQuestionIds);
  const candidatePages: SurveyPage[] = [];

  for (const rule of survey.conditionalLogicRules) {
    if (
      !sourceQuestionIdSet.has(rule.sourceQuestionId) ||
      !(
        (rule.actionType === "JUMP_TO_PAGE" && rule.targetPageId !== null) ||
        (rule.actionType === "JUMP_TO_QUESTION" && rule.targetQuestionId !== null)
      )
    ) {
      continue;
    }

    const sourceQuestion = survey.questions.find(
      (candidate) => candidate.id === rule.sourceQuestionId
    );

    if (!sourceQuestion || hiddenQuestionIds.has(sourceQuestion.id)) {
      continue;
    }

    const response = responsesByQuestionId.get(rule.sourceQuestionId);

    if (!doesRuleMatchResponse(rule, response)) {
      continue;
    }

    const targetPage = resolveRuleTargetPage(survey, rule);

    if (!targetPage || targetPage.id === page.id) {
      continue;
    }

    const visibleTargetPage = getVisibleTargetPage(survey, targetPage, hiddenQuestionIds);
    const visibleTargetPageIndex = visibleTargetPage
      ? orderedPages.findIndex((candidate) => candidate.id === visibleTargetPage.id)
      : -1;

    if (visibleTargetPage && visibleTargetPageIndex > currentPageIndex) {
      candidatePages.push(visibleTargetPage);
    }
  }

  return (
    candidatePages.sort(
      (left, right) =>
        orderedPages.findIndex((candidate) => candidate.id === right.id) -
        orderedPages.findIndex((candidate) => candidate.id === left.id)
    )[0] ?? null
  );
}

function resolveRuleTargetPage(
  survey: Survey,
  rule: ConditionalLogicRule
): SurveyPage | null {
  if (rule.targetPageId) {
    return survey.pages.find((candidate) => candidate.id === rule.targetPageId) ?? null;
  }

  if (rule.targetQuestionId) {
    const targetQuestion = survey.questions.find(
      (candidate) => candidate.id === rule.targetQuestionId
    );

    return targetQuestion
      ? survey.pages.find((candidate) => candidate.id === targetQuestion.pageId) ?? null
      : null;
  }

  return null;
}

function appendProjectedPagePath(
  survey: Survey,
  currentPage: SurveyPage,
  hiddenQuestionIds: ReadonlySet<number>,
  visitedPageIds: Set<number>,
  path: SurveyPage[],
  visibleQuestionIdsByPageId: Record<number, number[]>
) {
  const orderedPages = getOrderedPages(survey);
  const currentPageIndex = orderedPages.findIndex((page) => page.id === currentPage.id);
  const normalFlowExcludedPageIds = getNormalFlowExcludedPageIds(survey);
  const normalFlowExcludedQuestionIds = getNormalFlowExcludedQuestionIds(survey);

  for (const page of orderedPages.slice(currentPageIndex + 1)) {
    if (visitedPageIds.has(page.id) || normalFlowExcludedPageIds.has(page.id)) {
      continue;
    }

    const visibleQuestionIds = getQuestionsForPage(survey, page.id)
      .filter(
        (question) =>
          !hiddenQuestionIds.has(question.id) &&
          !normalFlowExcludedQuestionIds.has(question.id)
      )
      .map((question) => question.id);

    if (visibleQuestionIds.length === 0) {
      continue;
    }

    visitedPageIds.add(page.id);
    path.push(page);
    visibleQuestionIdsByPageId[page.id] = visibleQuestionIds;
  }
}

function getNormalFlowExcludedQuestionIds(survey: Survey): Set<number> {
  return new Set(
    survey.conditionalLogicRules
      .filter(
        (rule) =>
          rule.skipTargetInNormalFlow &&
          rule.actionType === "JUMP_TO_QUESTION" &&
          rule.targetQuestionId !== null
      )
      .map((rule) => rule.targetQuestionId)
      .filter((targetQuestionId): targetQuestionId is number => targetQuestionId !== null)
  );
}

function getNormalFlowExcludedPageIds(survey: Survey): Set<number> {
  const pageIds = new Set<number>();

  for (const rule of survey.conditionalLogicRules) {
    if (
      !rule.skipTargetInNormalFlow ||
      rule.actionType !== "JUMP_TO_PAGE" ||
      rule.targetPageId === null
    ) {
      continue;
    }

    pageIds.add(rule.targetPageId);
  }

  return pageIds;
}

function hasProgressiveResponseForQuestion(
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (!question.isRequired) {
    return true;
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
