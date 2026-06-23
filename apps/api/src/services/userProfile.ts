import type {
  AuthUser,
  CurrentUserProfileResponse,
  CurrentUserSurveyStats,
  UpdateCurrentUserProfileResponse,
  UserProfile
} from "@survey-portal/shared";

import { pool } from "../db.js";

const profileFieldMaxLength = 120;

interface UserProfileRecord {
  contact_number: string | null;
  preferred_contact_method: string | null;
  contact_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface UserSurveyStatsRecord {
  available: string;
  in_progress: string;
  completed: string;
  last_activity_at: Date | null;
}

interface NormalizedProfileInput {
  contactNumber?: string | null;
  preferredContactMethod?: string | null;
  contactNotes?: string | null;
}

export type ProfileValidationResult =
  | { ok: true; value: NormalizedProfileInput }
  | { ok: false; error: string };

export async function buildCurrentUserProfileResponse(
  user: AuthUser
): Promise<CurrentUserProfileResponse> {
  const [profile, surveyStats] = await Promise.all([
    fetchUserProfile(user.id),
    fetchRegisteredUserSurveyStats(user.id)
  ]);

  return {
    user,
    profile,
    surveyStats
  };
}

export async function updateCurrentUserProfile(
  userId: number,
  input: NormalizedProfileInput
): Promise<UpdateCurrentUserProfileResponse> {
  const result = await pool.query<UserProfileRecord>(
    `insert into user_profiles (
       user_id,
       contact_number,
       preferred_contact_method,
       contact_notes
     )
     values ($1, $2, $3, $4)
     on conflict (user_id)
     do update
     set contact_number = case when $5 then excluded.contact_number else user_profiles.contact_number end,
         preferred_contact_method = case when $6 then excluded.preferred_contact_method else user_profiles.preferred_contact_method end,
         contact_notes = case when $7 then excluded.contact_notes else user_profiles.contact_notes end,
         updated_at = now()
     returning contact_number, preferred_contact_method, contact_notes, created_at, updated_at`,
    [
      userId,
      input.contactNumber ?? null,
      input.preferredContactMethod ?? null,
      input.contactNotes ?? null,
      "contactNumber" in input,
      "preferredContactMethod" in input,
      "contactNotes" in input
    ]
  );

  return {
    profile: mapUserProfileRecord(result.rows[0])
  };
}

export function validateProfileUpdateBody(body: unknown): ProfileValidationResult {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const contactNumber = readOptionalProfileField(body, "contactNumber", "Contact number");

  if (!contactNumber.ok) {
    return contactNumber;
  }

  const preferredContactMethod = readOptionalProfileField(
    body,
    "preferredContactMethod",
    "Preferred contact method"
  );

  if (!preferredContactMethod.ok) {
    return preferredContactMethod;
  }

  const contactNotes = readOptionalProfileField(body, "contactNotes", "Contact notes");

  if (!contactNotes.ok) {
    return contactNotes;
  }

  return {
    ok: true,
    value: {
      ...("value" in contactNumber ? { contactNumber: contactNumber.value } : {}),
      ...("value" in preferredContactMethod
        ? { preferredContactMethod: preferredContactMethod.value }
        : {}),
      ...("value" in contactNotes ? { contactNotes: contactNotes.value } : {})
    }
  };
}

export async function fetchUserProfile(userId: number): Promise<UserProfile> {
  const result = await pool.query<UserProfileRecord>(
    `select contact_number, preferred_contact_method, contact_notes, created_at, updated_at
     from user_profiles
     where user_id = $1`,
    [userId]
  );

  return result.rows[0] ? mapUserProfileRecord(result.rows[0]) : emptyUserProfile();
}

export async function fetchRegisteredUserSurveyStats(
  userId: number
): Promise<CurrentUserSurveyStats> {
  const result = await pool.query<UserSurveyStatsRecord>(
    `with active_or_completed_attempts as (
       select survey_id, status, last_activity_at, completed_at, updated_at, started_at
       from survey_attempts
       where user_id = $1
         and status in ('not_started', 'in_progress', 'completed')
     ),
     available_surveys as (
       select surveys.id
       from surveys
       where surveys.status = 'published'
         and surveys.deleted_at is null
         and not exists (
           select 1
           from active_or_completed_attempts
           where active_or_completed_attempts.survey_id = surveys.id
         )
     ),
     -- Published surveys are available to start; non-draft attempted surveys
     -- stay visible in stats after retirement, matching /api/my-surveys.
     counted_attempts as (
       select active_or_completed_attempts.*
       from active_or_completed_attempts
       join surveys on surveys.id = active_or_completed_attempts.survey_id
       where surveys.status <> 'draft'
         and surveys.deleted_at is null
     ),
     -- Last activity means the user's last registered survey interaction, even
     -- if an abandoned attempt no longer contributes to the status tiles.
     registered_activity as (
       select greatest(
         coalesce(survey_attempts.last_activity_at, '-infinity'::timestamptz),
         coalesce(survey_attempts.completed_at, '-infinity'::timestamptz),
         coalesce(survey_attempts.updated_at, '-infinity'::timestamptz),
         coalesce(survey_attempts.started_at, '-infinity'::timestamptz)
       ) as activity_at
       from survey_attempts
       join surveys on surveys.id = survey_attempts.survey_id
       where survey_attempts.user_id = $1
         and surveys.status <> 'draft'
         and surveys.deleted_at is null
     )
     select
       (select count(*) from available_surveys) as available,
       count(*) filter (where counted_attempts.status in ('not_started', 'in_progress')) as in_progress,
       count(*) filter (where counted_attempts.status = 'completed') as completed,
       (select max(activity_at) from registered_activity) as last_activity_at
     from counted_attempts`,
    [userId]
  );
  const row = result.rows[0];
  const available = Number(row?.available ?? 0);
  const inProgress = Number(row?.in_progress ?? 0);
  const completed = Number(row?.completed ?? 0);
  const denominator = available + inProgress + completed;

  return {
    available,
    inProgress,
    completed,
    lastActivityAt: row?.last_activity_at?.toISOString() ?? null,
    completionRate: denominator === 0 ? 0 : Math.round((completed / denominator) * 100)
  };
}

function mapUserProfileRecord(record: UserProfileRecord): UserProfile {
  return {
    contactNumber: record.contact_number,
    preferredContactMethod: record.preferred_contact_method,
    contactNotes: record.contact_notes,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function emptyUserProfile(): UserProfile {
  return {
    contactNumber: null,
    preferredContactMethod: null,
    contactNotes: null,
    createdAt: null,
    updatedAt: null
  };
}

function readOptionalProfileField(
  body: Record<string, unknown>,
  field: keyof NormalizedProfileInput,
  label: string
): { ok: true; value: string | null } | { ok: true } | { ok: false; error: string } {
  const value = body[field];

  if (value === undefined) {
    return { ok: true };
  }

  if (value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be text` };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }

  if (trimmed.length > profileFieldMaxLength) {
    return { ok: false, error: `${label} must be ${profileFieldMaxLength} characters or fewer` };
  }

  return { ok: true, value: trimmed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
