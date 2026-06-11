import { Router } from "express";
import type { Response } from "express";
import type { HealthResponse } from "@survey-portal/shared";

import { config } from "../config.js";
import { checkDatabaseConnection } from "../db.js";

export const healthRouter = Router();

function baseHealthResponse(): Omit<HealthResponse, "status" | "database"> {
  return {
    app: "survey-portal",
    runEnv: config.runEnv,
    timestamp: new Date().toISOString()
  };
}

healthRouter.get("/live", (_req, res) => {
  const response: HealthResponse = {
    ...baseHealthResponse(),
    status: "ok",
    database: "not_checked"
  };

  res.status(200).json(response);
});

async function sendReadiness(res: Response) {
  const databaseConnected = await checkDatabaseConnection();
  const response: HealthResponse = {
    ...baseHealthResponse(),
    status: databaseConnected ? "ok" : "unavailable",
    database: databaseConnected ? "connected" : "unavailable"
  };

  res.status(databaseConnected ? 200 : 503).json(response);
}

healthRouter.get("/ready", async (_req, res) => {
  await sendReadiness(res);
});

healthRouter.get("/", async (_req, res) => {
  await sendReadiness(res);
});
