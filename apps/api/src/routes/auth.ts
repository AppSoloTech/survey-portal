import express from "express";
import pg from "pg";
import { rateLimit } from "express-rate-limit";

import {
  hashPassword,
  clearAuthCookie,
  mapUserRecord,
  normalizeEmail,
  passwordVerificationDecoyHash,
  setAuthCookie,
  validatePassword,
  verifyPassword,
  type UserRecord,
  type UserWithPasswordRecord
} from "../auth.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { clearCsrfCookie, issueCsrfToken } from "../middleware/security.js";
import { PostgresRateLimitStore } from "../services/rateLimitStore.js";
import {
  completePasswordReset,
  genericPasswordResetMessage,
  requestPasswordResetForEmail,
  requestPasswordResetForUser
} from "../services/passwordReset.js";
import {
  isRecord,
  isValidEmail,
  readTextField,
  validateRegistrationBody,
  type ValidationResult
} from "../services/validation.js";

const { DatabaseError } = pg;
const loginRateLimitStore = new PostgresRateLimitStore(
  "auth_login_ip",
  config.authRateLimitWindowMs
);
const loginEmailRateLimitStore = new PostgresRateLimitStore(
  "auth_login_email",
  config.authRateLimitWindowMs
);
const registerRateLimitStore = new PostgresRateLimitStore(
  "auth_register_ip",
  config.authRateLimitWindowMs
);
const registerEmailRateLimitStore = new PostgresRateLimitStore(
  "auth_register_email",
  config.authRateLimitWindowMs
);
const passwordResetRequestRateLimitStore = new PostgresRateLimitStore(
  "auth_reset_request_ip",
  config.authRateLimitWindowMs
);
const passwordResetEmailRateLimitStore = new PostgresRateLimitStore(
  "auth_reset_request_email",
  config.authRateLimitWindowMs
);
const passwordResetCompleteRateLimitStore = new PostgresRateLimitStore(
  "auth_reset_complete_ip",
  config.authRateLimitWindowMs
);

const authRateLimitHandler: express.RequestHandler = (_req, res) => {
  res.status(429).json({ error: "Too many authentication attempts. Please try again later." });
};

const loginRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: loginRateLimitStore,
  handler: authRateLimitHandler
});

const loginEmailRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: loginEmailRateLimitStore,
  keyGenerator: (req) => readEmailRateLimitKey(req.body),
  skipSuccessfulRequests: true,
  handler: authRateLimitHandler
});

const registerRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authRegisterRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: registerRateLimitStore,
  handler: authRateLimitHandler
});

const registerEmailRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authRegisterRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: registerEmailRateLimitStore,
  keyGenerator: (req) => readEmailRateLimitKey(req.body),
  handler: authRateLimitHandler
});

const passwordResetRequestRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: passwordResetRequestRateLimitStore,
  handler: authRateLimitHandler
});

const passwordResetEmailRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: passwordResetEmailRateLimitStore,
  keyGenerator: (req) => readEmailRateLimitKey(req.body),
  handler: authRateLimitHandler
});

const passwordResetCompleteRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: passwordResetCompleteRateLimitStore,
  handler: authRateLimitHandler
});

export const authRouter = express.Router();

authRouter.get("/csrf", (_req, res) => {
  res.json({ csrfToken: issueCsrfToken(res) });
});

authRouter.post(
  "/register",
  registerRateLimiter,
  registerEmailRateLimiter,
  async (req, res, next) => {
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
         returning id, first_name, last_name, email, role, session_version, created_at, updated_at`,
        [
          validation.value.firstName,
          validation.value.lastName,
          validation.value.email,
          passwordHash
        ]
      );

      const user = mapUserRecord(result.rows[0]);
      setAuthCookie(res, user, result.rows[0].session_version);
      res.status(201).json({ user });
    } catch (error) {
      if (isUniqueEmailError(error)) {
        res.status(409).json({ error: "Email is already registered" });
        return;
      }

      next(error);
    }
  }
);

authRouter.post("/login", loginRateLimiter, loginEmailRateLimiter, async (req, res, next) => {
  try {
    const validation = validateLoginBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<UserWithPasswordRecord>(
      `select id, first_name, last_name, email, password_hash, role, session_version, created_at, updated_at
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
    setAuthCookie(res, user, record.session_version);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/password-reset/request",
  passwordResetRequestRateLimiter,
  passwordResetEmailRateLimiter,
  (req, res) => {
    const email = readPasswordResetEmail(req.body);

    if (email) {
      queuePasswordResetRequest(email);
    }

    res.json({ message: genericPasswordResetMessage });
  }
);

authRouter.post(
  "/password-reset/complete",
  passwordResetCompleteRateLimiter,
  async (req, res, next) => {
    try {
      const validation = validatePasswordResetCompleteBody(req.body);

      if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const didReset = await completePasswordReset(validation.value);

      if (!didReset) {
        res.status(400).json({ error: "Password reset link is invalid or expired" });
        return;
      }

      res.json({ message: "Password has been reset. You can now log in." });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: (req as AuthenticatedRequest).user });
});

authRouter.post("/me/password-reset/request", requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;

    await requestPasswordResetForUser({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    });

    res.json({ message: genericPasswordResetMessage });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  clearCsrfCookie(res);
  res.status(204).send();
});

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

function readPasswordResetEmail(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const email = normalizeEmail(readTextField(body, "email"));

  return isValidEmail(email) ? email : null;
}

function readEmailRateLimitKey(body: unknown): string {
  if (!isRecord(body)) {
    return "invalid-email";
  }

  const email = normalizeEmail(readTextField(body, "email"));

  return isValidEmail(email) ? email : "invalid-email";
}

function validatePasswordResetCompleteBody(body: unknown): ValidationResult<{
  token: string;
  newPassword: string;
}> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const token = readTextField(body, "token");
  const newPassword = readTextField(body, "newPassword");

  if (!token || !newPassword) {
    return { ok: false, error: "Reset token and new password are required" };
  }

  const passwordError = validatePassword(newPassword);

  if (passwordError) {
    return { ok: false, error: passwordError };
  }

  return {
    ok: true,
    value: {
      token,
      newPassword
    }
  };
}

function queuePasswordResetRequest(email: string): void {
  void requestPasswordResetForEmail({ email }).catch(() => {
    console.warn("Password reset request failed after generic response");
  });
}

function isUniqueEmailError(error: unknown): boolean {
  return error instanceof DatabaseError && error.constraint === "users_email_unique";
}

export async function resetAuthRateLimitersForTests(): Promise<void> {
  await Promise.all([
    loginRateLimitStore.resetAll(),
    loginEmailRateLimitStore.resetAll(),
    registerRateLimitStore.resetAll(),
    registerEmailRateLimitStore.resetAll(),
    passwordResetRequestRateLimitStore.resetAll(),
    passwordResetEmailRateLimitStore.resetAll(),
    passwordResetCompleteRateLimitStore.resetAll()
  ]);
}
