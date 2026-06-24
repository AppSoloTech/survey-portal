import crypto from "node:crypto";

import type { AnonymousSurveyDirectoryItem, AnonymousSurveyLink } from "@survey-portal/shared";
import type { PoolClient } from "pg";

import { config } from "../config.js";
import { pool } from "../db.js";

const linkTokenPrefix = "asl";
const attemptTokenPrefix = "aat";
const encryptedPublicTokenPrefix = "enc:v1";

export interface AnonymousSurveyLinkRecord {
  id: number;
  survey_id: number;
  token_lookup_key: string;
  token_secret_hash: string;
  public_token: string | null;
  enabled: boolean;
  listed_in_public_directory: boolean;
  expires_at: Date | null;
  created_by_user_id: number | null;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AvailableAnonymousSurveyLink extends AnonymousSurveyLinkRecord {
  survey_status: string;
  survey_deleted_at: Date | null;
}

interface AnonymousSurveyDirectoryRecord {
  survey_title: string;
  survey_description: string | null;
  category_name: string | null;
  public_token: string | null;
  expires_at: Date | null;
  updated_at: Date;
}

export function generateAnonymousLinkToken(): {
  lookupKey: string;
  secret: string;
  token: string;
  secretHash: string;
} {
  const lookupKey = randomUrlToken(12);
  const secret = randomUrlToken(32);

  return {
    lookupKey,
    secret,
    token: `${linkTokenPrefix}.${lookupKey}.${secret}`,
    secretHash: hashTokenSecret(secret)
  };
}

export function generateAnonymousAttemptToken(): {
  token: string;
  tokenHash: string;
} {
  const secret = randomUrlToken(32);
  const token = `${attemptTokenPrefix}.${secret}`;

  return {
    token,
    tokenHash: hashTokenSecret(secret)
  };
}

export async function createAnonymousSurveyLink(input: {
  surveyId: number;
  createdByUserId: number;
  expiresAt: Date | null;
}): Promise<{ link: AnonymousSurveyLink; token: string; publicUrl: string } | null> {
  const token = generateAnonymousLinkToken();
  const result = await pool.query<AnonymousSurveyLinkRecord>(
    `with eligible_survey as (
       select id
       from surveys
       where id = $1
         and status = 'published'
         and deleted_at is null
     )
     insert into anonymous_survey_links (
       survey_id,
       token_lookup_key,
       token_secret_hash,
       public_token,
       expires_at,
       created_by_user_id
     )
     select id, $2, $3, $4, $5, $6
     from eligible_survey
     returning
       id,
       survey_id,
       token_lookup_key,
       token_secret_hash,
       public_token,
       enabled,
       listed_in_public_directory,
       expires_at,
       created_by_user_id,
       disabled_at,
       created_at,
       updated_at`,
    [
      input.surveyId,
      token.lookupKey,
      token.secretHash,
      encryptPublicToken(token.token),
      input.expiresAt,
      input.createdByUserId
    ]
  );
  const link = result.rows[0];

  if (!link) {
    return null;
  }

  return {
    link: mapAnonymousSurveyLinkRecord(link),
    token: token.token,
    publicUrl: buildAnonymousSurveyUrl(token.token)
  };
}

export async function listAnonymousSurveyLinks(surveyId: number): Promise<AnonymousSurveyLink[]> {
  const result = await pool.query<AnonymousSurveyLinkRecord>(
    `select
       id,
       survey_id,
       token_lookup_key,
       token_secret_hash,
       public_token,
       enabled,
       listed_in_public_directory,
       expires_at,
       created_by_user_id,
       disabled_at,
       created_at,
       updated_at
     from anonymous_survey_links
     where survey_id = $1
     order by created_at desc, id desc`,
    [surveyId]
  );

  return result.rows.map(mapAnonymousSurveyLinkRecord);
}

export async function disableAnonymousSurveyLink(input: {
  surveyId: number;
  linkId: number;
}): Promise<AnonymousSurveyLink | null> {
  const result = await pool.query<AnonymousSurveyLinkRecord>(
    `update anonymous_survey_links
     set enabled = false,
         disabled_at = coalesce(disabled_at, now()),
         listed_in_public_directory = false,
         updated_at = now()
     where id = $1
       and survey_id = $2
     returning
       id,
       survey_id,
       token_lookup_key,
       token_secret_hash,
       public_token,
       enabled,
       listed_in_public_directory,
       expires_at,
       created_by_user_id,
       disabled_at,
       created_at,
       updated_at`,
    [input.linkId, input.surveyId]
  );

  return result.rows[0] ? mapAnonymousSurveyLinkRecord(result.rows[0]) : null;
}

export async function rotateAnonymousSurveyLink(input: {
  surveyId: number;
  linkId: number;
  createdByUserId: number;
  expiresAt: Date | null | undefined;
}): Promise<{
  disabledLink: AnonymousSurveyLink;
  link: AnonymousSurveyLink;
  token: string;
  publicUrl: string;
} | null> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const existingResult = await client.query<AnonymousSurveyLinkRecord>(
      `select
         id,
         survey_id,
         token_lookup_key,
         token_secret_hash,
         public_token,
         enabled,
         listed_in_public_directory,
         expires_at,
         created_by_user_id,
         disabled_at,
         created_at,
         updated_at
       from anonymous_survey_links
       where id = $1
         and survey_id = $2
         and enabled = true
       for update`,
      [input.linkId, input.surveyId]
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      await client.query("rollback");
      return null;
    }

    const newLink = await insertAnonymousSurveyLink(client, {
      surveyId: input.surveyId,
      createdByUserId: input.createdByUserId,
      expiresAt: input.expiresAt === undefined ? existing.expires_at : input.expiresAt
    });

    if (!newLink) {
      await client.query("rollback");
      return null;
    }

    const disabledResult = await client.query<AnonymousSurveyLinkRecord>(
      `update anonymous_survey_links
       set enabled = false,
           disabled_at = coalesce(disabled_at, now()),
           listed_in_public_directory = false,
           updated_at = now()
       where id = $1
         and survey_id = $2
       returning
         id,
         survey_id,
         token_lookup_key,
         token_secret_hash,
         public_token,
         enabled,
         listed_in_public_directory,
         expires_at,
         created_by_user_id,
         disabled_at,
         created_at,
         updated_at`,
      [input.linkId, input.surveyId]
    );

    await client.query("commit");

    return {
      disabledLink: mapAnonymousSurveyLinkRecord(disabledResult.rows[0]),
      link: mapAnonymousSurveyLinkRecord(newLink.record),
      token: newLink.token,
      publicUrl: buildAnonymousSurveyUrl(newLink.token)
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function fetchAvailableAnonymousSurveyLink(
  token: string
): Promise<AvailableAnonymousSurveyLink | null> {
  const parsed = parseAnonymousLinkToken(token);

  if (!parsed) {
    return null;
  }

  const result = await pool.query<AvailableAnonymousSurveyLink>(
    `select
       anonymous_survey_links.id,
       anonymous_survey_links.survey_id,
       anonymous_survey_links.token_lookup_key,
       anonymous_survey_links.token_secret_hash,
       anonymous_survey_links.public_token,
       anonymous_survey_links.enabled,
       anonymous_survey_links.listed_in_public_directory,
       anonymous_survey_links.expires_at,
       anonymous_survey_links.created_by_user_id,
       anonymous_survey_links.disabled_at,
       anonymous_survey_links.created_at,
       anonymous_survey_links.updated_at,
       surveys.status as survey_status,
       surveys.deleted_at as survey_deleted_at
     from anonymous_survey_links
     join surveys on surveys.id = anonymous_survey_links.survey_id
     where anonymous_survey_links.token_lookup_key = $1
       and anonymous_survey_links.enabled = true
       and (
         anonymous_survey_links.expires_at is null
         or anonymous_survey_links.expires_at > now()
       )
       and surveys.status = 'published'
       and surveys.deleted_at is null`,
    [parsed.lookupKey]
  );
  const link = result.rows[0];

  if (!link || !tokenSecretMatches(link.token_secret_hash, hashTokenSecret(parsed.secret))) {
    return null;
  }

  return link;
}

export async function updateAnonymousSurveyLinkDirectoryListing(input: {
  surveyId: number;
  linkId: number;
  listedInPublicDirectory: boolean;
}): Promise<AnonymousSurveyLink | null> {
  const result = await pool.query<AnonymousSurveyLinkRecord>(
    `update anonymous_survey_links
     set listed_in_public_directory = $3,
         updated_at = now()
     where id = $1
       and survey_id = $2
     returning
       id,
       survey_id,
       token_lookup_key,
       token_secret_hash,
       public_token,
       enabled,
       listed_in_public_directory,
       expires_at,
       created_by_user_id,
       disabled_at,
       created_at,
       updated_at`,
    [input.linkId, input.surveyId, input.listedInPublicDirectory]
  );

  return result.rows[0] ? mapAnonymousSurveyLinkRecord(result.rows[0]) : null;
}

export async function listAnonymousSurveyDirectory(): Promise<AnonymousSurveyDirectoryItem[]> {
  const result = await pool.query<AnonymousSurveyDirectoryRecord>(
    `select
       surveys.title as survey_title,
       surveys.description as survey_description,
       survey_categories.name as category_name,
       anonymous_survey_links.public_token,
       anonymous_survey_links.expires_at,
       anonymous_survey_links.updated_at
     from anonymous_survey_links
     join surveys on surveys.id = anonymous_survey_links.survey_id
     left join survey_categories on survey_categories.id = surveys.category_id
     where anonymous_survey_links.listed_in_public_directory = true
       and anonymous_survey_links.enabled = true
       and anonymous_survey_links.public_token is not null
       and (
         anonymous_survey_links.expires_at is null
         or anonymous_survey_links.expires_at > now()
       )
       and surveys.status = 'published'
       and surveys.deleted_at is null
     order by anonymous_survey_links.updated_at desc, anonymous_survey_links.id desc`
  );

  return result.rows.flatMap((record) => {
    const publicToken = decryptPublicToken(record.public_token);

    if (!publicToken) {
      return [];
    }

    return [
      {
        surveyTitle: record.survey_title,
        surveyDescription: record.survey_description,
        categoryName: record.category_name,
        expiresAt: record.expires_at?.toISOString() ?? null,
        listedAt: record.updated_at.toISOString(),
        publicUrl: buildAnonymousSurveyUrl(publicToken)
      }
    ];
  });
}

export function hashAnonymousAttemptToken(token: string): string | null {
  const parsed = parseAnonymousAttemptToken(token);

  return parsed ? hashTokenSecret(parsed.secret) : null;
}

export function buildAnonymousSurveyUrl(token: string): string {
  return `${config.webOrigin.replace(/\/+$/, "")}/anonymous-surveys/${encodeURIComponent(token)}`;
}

function mapAnonymousSurveyLinkRecord(record: AnonymousSurveyLinkRecord): AnonymousSurveyLink {
  const publicToken = decryptPublicToken(record.public_token);

  return {
    id: record.id,
    surveyId: record.survey_id,
    enabled: record.enabled,
    listedInPublicDirectory: record.listed_in_public_directory,
    expiresAt: record.expires_at?.toISOString() ?? null,
    disabledAt: record.disabled_at?.toISOString() ?? null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    ...(record.enabled && publicToken
      ? { publicUrl: buildAnonymousSurveyUrl(publicToken) }
      : {})
  };
}

async function insertAnonymousSurveyLink(
  queryable: Pick<PoolClient, "query">,
  input: {
    surveyId: number;
    createdByUserId: number;
    expiresAt: Date | null;
  }
): Promise<{ record: AnonymousSurveyLinkRecord; token: string } | null> {
  const token = generateAnonymousLinkToken();
  const result = await queryable.query<AnonymousSurveyLinkRecord>(
    `with eligible_survey as (
       select id
       from surveys
       where id = $1
         and status = 'published'
         and deleted_at is null
     )
     insert into anonymous_survey_links (
       survey_id,
       token_lookup_key,
       token_secret_hash,
       public_token,
       expires_at,
       created_by_user_id
     )
     select id, $2, $3, $4, $5, $6
     from eligible_survey
     returning
       id,
       survey_id,
       token_lookup_key,
       token_secret_hash,
       public_token,
       enabled,
       listed_in_public_directory,
       expires_at,
       created_by_user_id,
       disabled_at,
       created_at,
       updated_at`,
    [
      input.surveyId,
      token.lookupKey,
      token.secretHash,
      encryptPublicToken(token.token),
      input.expiresAt,
      input.createdByUserId
    ]
  );
  const record = result.rows[0];

  return record ? { record, token: token.token } : null;
}

function parseAnonymousLinkToken(token: string): { lookupKey: string; secret: string } | null {
  const parts = token.split(".");

  if (parts.length !== 3 || parts[0] !== linkTokenPrefix || !parts[1] || !parts[2]) {
    return null;
  }

  return { lookupKey: parts[1], secret: parts[2] };
}

function encryptPublicToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", publicTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    encryptedPublicTokenPrefix,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

function decryptPublicToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith(`${linkTokenPrefix}.`)) {
    return value;
  }

  const parts = value.split(":");

  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== encryptedPublicTokenPrefix) {
    return null;
  }

  try {
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const ciphertext = Buffer.from(parts[4], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", publicTokenEncryptionKey(), iv);

    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function parseAnonymousAttemptToken(token: string): { secret: string } | null {
  const parts = token.split(".");

  if (parts.length !== 2 || parts[0] !== attemptTokenPrefix || !parts[1]) {
    return null;
  }

  return { secret: parts[1] };
}

function hashTokenSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function publicTokenEncryptionKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(config.anonymousLinkTokenEncryptionSecret)
    .digest();
}

function tokenSecretMatches(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");

  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function randomUrlToken(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}
