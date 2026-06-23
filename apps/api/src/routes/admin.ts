import type { AdminUserDetailResponse, AdminUserSummary, UserRole } from "@survey-portal/shared";
import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  genericPasswordResetMessage,
  requestPasswordResetForUser
} from "../services/passwordReset.js";
import { fetchRegisteredUserSurveyStats, fetchUserProfile } from "../services/userProfile.js";
import { isRecord, readPositiveIntegerParam, readTextField } from "../services/validation.js";

const defaultUsersPageSize = 20;
const maxUsersPageSize = 100;

interface AdminUserRecord {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

function mapAdminUserRecord(record: AdminUserRecord): AdminUserSummary {
  return {
    id: record.id,
    firstName: record.first_name,
    lastName: record.last_name,
    email: record.email,
    role: record.role,
    createdAt: record.created_at.toISOString()
  };
}

function readPageParam(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function readOptionalRoleParam(value: unknown): UserRole | null | "invalid" {
  if (value === undefined) {
    return null;
  }

  if (value !== "user" && value !== "admin") {
    return "invalid";
  }

  return value;
}

export const adminRouter = express.Router();

adminRouter.get("/me", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ user: (req as AuthenticatedRequest).user });
});

adminRouter.get("/users", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const page = readPageParam(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = readPageParam(req.query.pageSize, defaultUsersPageSize, maxUsersPageSize);
    const offset = (page - 1) * pageSize;
    const role = readOptionalRoleParam(req.query.role);

    if (role === "invalid") {
      res.status(400).json({ error: "Role filter must be user or admin" });
      return;
    }

    const totalResult = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from users
       where ($1::text is null or role = $1)`,
      [role]
    );
    const usersResult = await pool.query<AdminUserRecord>(
      `select id, first_name, last_name, email, role, created_at
       from users
       where ($1::text is null or role = $1)
       order by id
       limit $2
       offset $3`,
      [role, pageSize, offset]
    );

    res.json({
      users: usersResult.rows.map(mapAdminUserRecord),
      total: Number(totalResult.rows[0].count),
      page,
      pageSize
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const userId = readPositiveIntegerParam(req.params.id);

    if (!userId) {
      res.status(400).json({ error: "User id must be a positive integer" });
      return;
    }

    const user = await fetchAdminUserById(userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [profile, surveyStats] = await Promise.all([
      fetchUserProfile(user.id),
      fetchRegisteredUserSurveyStats(user.id)
    ]);
    const response: AdminUserDetailResponse = {
      user,
      profile,
      surveyStats
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/users/:id/role", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const userId = readPositiveIntegerParam(req.params.id);

    if (!userId) {
      res.status(400).json({ error: "User id must be a positive integer" });
      return;
    }

    if (!isRecord(req.body)) {
      res.status(400).json({ error: "Request body is required" });
      return;
    }

    const role = readTextField(req.body, "role");

    if (role !== "user" && role !== "admin") {
      res.status(400).json({ error: "Role must be user or admin" });
      return;
    }

    const requester = (req as AuthenticatedRequest).user;

    if (requester.id === userId) {
      res.status(409).json({ error: "You cannot change your own role" });
      return;
    }

    const result = await pool.query<AdminUserRecord>(
      `update users
       set role = $2,
           updated_at = now()
       where id = $1
       returning id, first_name, last_name, email, role, created_at`,
      [userId, role]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: mapAdminUserRecord(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/users/:id/password-reset",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const userId = readPositiveIntegerParam(req.params.id);

      if (!userId) {
        res.status(400).json({ error: "User id must be a positive integer" });
        return;
      }

      const user = await fetchAdminUserById(userId);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

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
  }
);

async function fetchAdminUserById(userId: number): Promise<AdminUserSummary | null> {
  const result = await pool.query<AdminUserRecord>(
    `select id, first_name, last_name, email, role, created_at
     from users
     where id = $1`,
    [userId]
  );

  return result.rows[0] ? mapAdminUserRecord(result.rows[0]) : null;
}
