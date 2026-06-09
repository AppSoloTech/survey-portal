import { Router } from "express";
import type { HealthResponse } from "@survey-portal/shared";

import { config } from "../config.js";
import { checkDatabaseConnection } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const databaseConnected = await checkDatabaseConnection();
  const response: HealthResponse & { database: "connected" | "unavailable" } = {
    status: "ok",
    app: "survey-portal",
    runEnv: config.runEnv,
    timestamp: new Date().toISOString(),
    database: databaseConnected ? "connected" : "unavailable"
  };

  res.status(200).json(response);
});
