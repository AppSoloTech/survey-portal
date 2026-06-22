import crypto from "node:crypto";

import type { PoolClient } from "pg";

import { hashPassword } from "../auth.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { emailClient, type EmailClient } from "./email.js";

const resetTokenPrefix = "prt";
const resetTokenLifetimeMs = 60 * 60 * 1000;

export const genericPasswordResetMessage =
  "If an account exists for that email, a password reset link will be sent.";

interface UserEmailRecord {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface PasswordResetTokenRecord {
  id: number;
  user_id: number;
  token_lookup_key: string;
  token_secret_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PasswordResetRequestResult {
  token: string | null;
  resetUrl: string | null;
  expiresAt: Date | null;
}

export function generatePasswordResetToken(): {
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
    token: `${resetTokenPrefix}.${lookupKey}.${secret}`,
    secretHash: hashTokenSecret(secret)
  };
}

export function buildPasswordResetUrl(token: string): string {
  const origin = config.webOrigin.replace(/\/+$/, "");

  return `${origin}/reset-password#token=${encodeURIComponent(token)}`;
}

export async function requestPasswordResetForEmail(input: {
  email: string;
  client?: EmailClient;
}): Promise<PasswordResetRequestResult> {
  const result = await pool.query<UserEmailRecord>(
    `select id, first_name, last_name, email
     from users
     where email = $1`,
    [input.email]
  );
  const user = result.rows[0];

  if (!user) {
    return { token: null, resetUrl: null, expiresAt: null };
  }

  return createPasswordResetForUser(
    {
      userId: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email
    },
    input.client
  );
}

export async function requestPasswordResetForUser(input: {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  client?: EmailClient;
}): Promise<PasswordResetRequestResult> {
  return createPasswordResetForUser(input, input.client);
}

export async function completePasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<boolean> {
  const parsed = parsePasswordResetToken(input.token);

  if (!parsed) {
    return false;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await client.query<PasswordResetTokenRecord>(
      `select
         id,
         user_id,
         token_lookup_key,
         token_secret_hash,
         expires_at,
         consumed_at,
         created_at,
         updated_at
       from password_reset_tokens
       where token_lookup_key = $1
       for update`,
      [parsed.lookupKey]
    );
    const resetToken = result.rows[0];

    if (!resetToken || !isResetTokenUsable(resetToken, parsed.secret)) {
      await client.query("rollback");
      return false;
    }

    const passwordHash = await hashPassword(input.newPassword);

    await client.query(
      `update users
       set password_hash = $1,
           updated_at = now()
       where id = $2`,
      [passwordHash, resetToken.user_id]
    );

    // Consuming all outstanding reset tokens for the account prevents an older
    // email link from remaining usable after a password has been changed.
    await client.query(
      `update password_reset_tokens
       set consumed_at = coalesce(consumed_at, now()),
           updated_at = now()
       where user_id = $1
         and consumed_at is null`,
      [resetToken.user_id]
    );

    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createPasswordResetForUser(
  input: {
    userId: number;
    email: string;
    firstName: string;
    lastName: string;
  },
  client: EmailClient = emailClient
): Promise<PasswordResetRequestResult> {
  const token = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + resetTokenLifetimeMs);
  const resetUrl = buildPasswordResetUrl(token.token);

  await insertPasswordResetToken(pool, {
    userId: input.userId,
    lookupKey: token.lookupKey,
    secretHash: token.secretHash,
    expiresAt
  });

  await client.send({
    template: "password_reset",
    to: {
      email: input.email,
      name: `${input.firstName} ${input.lastName}`.trim()
    },
    resetUrl,
    expiresAt: expiresAt.toISOString()
  });

  return {
    token: token.token,
    resetUrl,
    expiresAt
  };
}

async function insertPasswordResetToken(
  queryable: Pick<PoolClient, "query">,
  input: {
    userId: number;
    lookupKey: string;
    secretHash: string;
    expiresAt: Date;
  }
): Promise<void> {
  await queryable.query(
    `insert into password_reset_tokens (
       user_id,
       token_lookup_key,
       token_secret_hash,
       expires_at
     )
     values ($1, $2, $3, $4)`,
    [input.userId, input.lookupKey, input.secretHash, input.expiresAt]
  );
}

function parsePasswordResetToken(token: string): { lookupKey: string; secret: string } | null {
  const parts = token.split(".");

  if (parts.length !== 3 || parts[0] !== resetTokenPrefix || !parts[1] || !parts[2]) {
    return null;
  }

  return { lookupKey: parts[1], secret: parts[2] };
}

function isResetTokenUsable(record: PasswordResetTokenRecord, secret: string): boolean {
  return (
    record.consumed_at === null &&
    record.expires_at.getTime() > Date.now() &&
    tokenSecretMatches(record.token_secret_hash, hashTokenSecret(secret))
  );
}

function hashTokenSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function tokenSecretMatches(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");

  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function randomUrlToken(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}
