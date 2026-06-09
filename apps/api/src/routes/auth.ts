import express from "express";
import pg from "pg";

import {
  hashPassword,
  clearAuthCookie,
  mapUserRecord,
  normalizeEmail,
  passwordVerificationDecoyHash,
  setAuthCookie,
  verifyPassword,
  type UserRecord,
  type UserWithPasswordRecord
} from "../auth.js";
import { pool } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const { DatabaseError } = pg;

export const authRouter = express.Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const validation = validateRegistrationBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const passwordHash = await hashPassword(validation.value.password);
    const result = await pool.query<UserRecord>(
      `insert into users (first_name, last_name, email, password_hash, role)
       values ($1, $2, $3, $4, 'user')
       returning id, first_name, last_name, email, role, created_at, updated_at`,
      [
        validation.value.firstName,
        validation.value.lastName,
        validation.value.email,
        passwordHash
      ]
    );

    const user = mapUserRecord(result.rows[0]);
    setAuthCookie(res, user);
    res.status(201).json({ user });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      res.status(409).json({ error: "Email is already registered" });
      return;
    }

    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const validation = validateLoginBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<UserWithPasswordRecord>(
      `select id, first_name, last_name, email, password_hash, role, created_at, updated_at
       from users
       where email = $1`,
      [validation.value.email]
    );

    const record = result.rows[0];
    const passwordHash = record?.password_hash ?? passwordVerificationDecoyHash;
    const isValidPassword = await verifyPassword(validation.value.password, passwordHash);

    if (!record || !isValidPassword) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user = mapUserRecord(record);
    setAuthCookie(res, user);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: (req as AuthenticatedRequest).user });
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).send();
});

function validateRegistrationBody(body: unknown): ValidationResult<{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const firstName = readTextField(body, "first_name");
  const lastName = readTextField(body, "last_name");
  const email = normalizeEmail(readTextField(body, "email"));
  const password = readTextField(body, "password");

  if (!firstName || !lastName || !email || !password) {
    return { ok: false, error: "First name, last name, email, and password are required" };
  }

  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address" };
  }

  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      password
    }
  };
}

function validateLoginBody(body: unknown): ValidationResult<{ email: string; password: string }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const email = normalizeEmail(readTextField(body, "email"));
  const password = readTextField(body, "password");

  if (!email || !password) {
    return { ok: false, error: "Email and password are required" };
  }

  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address" };
  }

  return {
    ok: true,
    value: {
      email,
      password
    }
  };
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTextField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUniqueEmailError(error: unknown): boolean {
  return error instanceof DatabaseError && error.constraint === "users_email_unique";
}
