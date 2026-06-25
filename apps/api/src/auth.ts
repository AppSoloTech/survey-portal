import bcrypt from "bcrypt";
import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthUser, UserRole } from "@survey-portal/shared";

import { config } from "./config.js";

const passwordHashRounds = 12;
const maxPasswordBytes = 72;
export const authCookieName = "survey_portal_auth";
// Keeps the missing-email login path on bcrypt's cost curve.
export const passwordVerificationDecoyHash =
  "$2b$12$8SieWt0hrB3qCXmmOLVx0./gPRcGtMVGksMgSKVYUemYs/XzZCTlK";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  sessionVersion: number;
}

export interface UserRecord {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  session_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithPasswordRecord extends UserRecord {
  password_hash: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function mapUserRecord(record: UserRecord): AuthUser {
  return {
    id: record.id,
    firstName: record.first_name,
    lastName: record.last_name,
    email: record.email,
    role: record.role,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, passwordHashRounds);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  if (Buffer.byteLength(password, "utf8") > maxPasswordBytes) {
    return "Password must be at most 72 bytes";
  }

  return null;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(user: AuthUser, sessionVersion: number): string {
  const expiresIn = config.jwtExpiresIn as jwt.SignOptions["expiresIn"];

  return jwt.sign(
    {
      email: user.email,
      role: user.role,
      sessionVersion
    },
    config.jwtSecret,
    {
      expiresIn,
      subject: String(user.id)
    }
  );
}

export function verifyAuthToken(token: string): JwtPayload {
  const payload = jwt.verify(token, config.jwtSecret);

  if (!isJwtPayload(payload)) {
    throw new Error("Invalid token payload");
  }

  return payload;
}

export function setAuthCookie(res: Response, user: AuthUser, sessionVersion: number): void {
  res.cookie(authCookieName, signAuthToken(user, sessionVersion), getAuthCookieOptions());
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(authCookieName, getAuthCookieOptions());
}

function getAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.isProduction
  };
}

function isJwtPayload(payload: string | jwt.JwtPayload): payload is JwtPayload {
  return (
    typeof payload !== "string" &&
    typeof payload.sub === "string" &&
    typeof payload.email === "string" &&
    typeof payload.sessionVersion === "number" &&
    Number.isSafeInteger(payload.sessionVersion) &&
    payload.sessionVersion >= 0 &&
    (payload.role === "user" || payload.role === "admin")
  );
}
