import type { NextFunction, Request, Response } from "express";
import type { AuthUser, UserRole } from "@survey-portal/shared";

import { mapUserRecord, verifyAuthToken, type UserRecord } from "../auth.js";
import { pool } from "../db.js";

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const result = await pool.query<UserRecord>(
      `select id, first_name, last_name, email, role, created_at, updated_at
       from users
       where id = $1`,
      [Number(payload.sub)]
    );

    const user = result.rows[0];

    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    (req as AuthenticatedRequest).user = mapUserRecord(user);
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Partial<AuthenticatedRequest>).user;

    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (user.role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
