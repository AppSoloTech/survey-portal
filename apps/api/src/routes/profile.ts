import express from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  buildCurrentUserProfileResponse,
  updateCurrentUserProfile,
  validateProfileUpdateBody
} from "../services/userProfile.js";

export const profileRouter = express.Router();

profileRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    res.json(await buildCurrentUserProfileResponse(user));
  } catch (error) {
    next(error);
  }
});

profileRouter.put("/", requireAuth, async (req, res, next) => {
  try {
    const validation = validateProfileUpdateBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    res.json(await updateCurrentUserProfile(user.id, validation.value));
  } catch (error) {
    next(error);
  }
});
