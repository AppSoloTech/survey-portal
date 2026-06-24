import type {
  AuthUser,
  CurrentUserProfileResponse,
  CurrentUserSurveyStats,
  UpdateCurrentUserProfileResponse,
  UserProfile
} from "@survey-portal/shared";
import { isPossiblePhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import type { QueryResult } from "pg";

import { mapUserRecord, type UserRecord } from "../auth.js";
import { pool } from "../db.js";

const profileFieldMaxLength = 120;
const addressStreetMaxLength = 160;
const addressFieldMaxLength = 80;

interface UserProfileRecord {
  contact_number: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
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
  firstName?: string;
  lastName?: string;
  contactNumber?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
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
  const client = await pool.connect();

  try {
    await client.query("begin");

    let userResult: QueryResult<UserRecord>;

    if ("firstName" in input || "lastName" in input) {
      userResult = await client.query<UserRecord>(
        `update users
         set first_name = case when $2 then $3 else first_name end,
             last_name = case when $4 then $5 else last_name end,
             updated_at = now()
         where id = $1
         returning id, first_name, last_name, email, role, created_at, updated_at`,
        [
          userId,
          "firstName" in input,
          input.firstName ?? "",
          "lastName" in input,
          input.lastName ?? ""
        ]
      );
    } else {
      userResult = await client.query<UserRecord>(
        `select id, first_name, last_name, email, role, created_at, updated_at
         from users
         where id = $1`,
        [userId]
      );
    }

    if (userResult.rowCount === 0) {
      throw new Error("Authenticated user not found");
    }

    if (
      "contactNumber" in input ||
      "addressStreet" in input ||
      "addressCity" in input ||
      "addressState" in input
    ) {
      await client.query(
        `insert into user_profiles (
           user_id,
           contact_number,
           address_street,
           address_city,
           address_state
         )
         values ($1, $2, $3, $4, $5)
         on conflict (user_id)
         do update
         set contact_number = case when $6 then excluded.contact_number else user_profiles.contact_number end,
             address_street = case when $7 then excluded.address_street else user_profiles.address_street end,
             address_city = case when $8 then excluded.address_city else user_profiles.address_city end,
             address_state = case when $9 then excluded.address_state else user_profiles.address_state end,
             updated_at = now()`,
        [
          userId,
          input.contactNumber ?? null,
          input.addressStreet ?? null,
          input.addressCity ?? null,
          input.addressState ?? null,
          "contactNumber" in input,
          "addressStreet" in input,
          "addressCity" in input,
          "addressState" in input
        ]
      );
    }

    const profileResult = await client.query<UserProfileRecord>(
      `select contact_number, address_street, address_city, address_state, created_at, updated_at
       from user_profiles
       where user_id = $1`,
      [userId]
    );

    await client.query("commit");

    return {
      user: mapUserRecord(userResult.rows[0]),
      profile: profileResult.rows[0] ? mapUserProfileRecord(profileResult.rows[0]) : emptyUserProfile()
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function validateProfileUpdateBody(body: unknown): ProfileValidationResult {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const firstName = readOptionalNameField(body, "firstName", "First name");

  if (!firstName.ok) {
    return firstName;
  }

  const lastName = readOptionalNameField(body, "lastName", "Last name");

  if (!lastName.ok) {
    return lastName;
  }

  const contactNumber = readOptionalProfileField(body, "contactNumber", "Phone number");

  if (!contactNumber.ok) {
    return contactNumber;
  }

  const addressStreet = readOptionalProfileField(
    body,
    "addressStreet",
    "Street address",
    addressStreetMaxLength
  );

  if (!addressStreet.ok) {
    return addressStreet;
  }

  const addressCity = readOptionalProfileField(
    body,
    "addressCity",
    "City",
    addressFieldMaxLength
  );

  if (!addressCity.ok) {
    return addressCity;
  }

  const addressState = readOptionalProfileField(
    body,
    "addressState",
    "State",
    addressFieldMaxLength
  );

  if (!addressState.ok) {
    return addressState;
  }

  return {
    ok: true,
    value: {
      ...("value" in firstName ? { firstName: firstName.value } : {}),
      ...("value" in lastName ? { lastName: lastName.value } : {}),
      ...("value" in contactNumber ? { contactNumber: contactNumber.value } : {}),
      ...("value" in addressStreet ? { addressStreet: addressStreet.value } : {}),
      ...("value" in addressCity ? { addressCity: addressCity.value } : {}),
      ...("value" in addressState ? { addressState: addressState.value } : {})
    }
  };
}

export async function fetchUserProfile(userId: number): Promise<UserProfile> {
  const result = await pool.query<UserProfileRecord>(
    `select contact_number, address_street, address_city, address_state, created_at, updated_at
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
    addressStreet: record.address_street,
    addressCity: record.address_city,
    addressState: record.address_state,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function emptyUserProfile(): UserProfile {
  return {
    contactNumber: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    createdAt: null,
    updatedAt: null
  };
}

function readOptionalNameField(
  body: Record<string, unknown>,
  field: "firstName" | "lastName",
  label: string
): { ok: true; value: string } | { ok: true } | { ok: false; error: string } {
  const value = body[field];

  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be text` };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: `${label} is required` };
  }

  if (trimmed.length > profileFieldMaxLength) {
    return { ok: false, error: `${label} must be ${profileFieldMaxLength} characters or fewer` };
  }

  return { ok: true, value: trimmed };
}

function readOptionalProfileField(
  body: Record<string, unknown>,
  field: keyof Pick<
    NormalizedProfileInput,
    "contactNumber" | "addressStreet" | "addressCity" | "addressState"
  >,
  label: string,
  maxLength = profileFieldMaxLength
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

  if (trimmed.length > maxLength) {
    return { ok: false, error: `${label} must be ${maxLength} characters or fewer` };
  }

  if (field === "contactNumber") {
    if (!isPossiblePhoneNumber(trimmed)) {
      return { ok: false, error: "Phone number must be a valid phone number" };
    }

    return { ok: true, value: parsePhoneNumber(trimmed).number };
  }

  return { ok: true, value: trimmed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
