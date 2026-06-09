import express from "express";

import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

export const adminRouter = express.Router();

adminRouter.get("/me", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ user: (req as AuthenticatedRequest).user });
});
