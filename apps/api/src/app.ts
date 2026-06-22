import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { adminRouter } from "./routes/admin.js";
import { anonymousSurveyPublicRouter } from "./routes/anonymousSurveyRoutes.js";
import { authRouter } from "./routes/auth.js";
import { categoriesRouter } from "./routes/categories.js";
import { healthRouter } from "./routes/health.js";
import { mySurveysRouter, surveysRouter } from "./routes/surveys.js";
import { tagsRouter } from "./routes/tags.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.set("trust proxy", config.trustProxyHops);

  app.use(requestLogger);
  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "100kb" }));

  if (!config.isProduction) {
    app.use(
      cors({
        credentials: true,
        origin: config.webOrigin
      })
    );
  }

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/anonymous-surveys", anonymousSurveyPublicRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/surveys", surveysRouter);
  app.use("/api/my-surveys", mySurveysRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tags", tagsRouter);

  const staticPath = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(staticPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "API route not found" });
      return;
    }

    res.sendFile(path.join(staticPath, "index.html"), (error) => {
      if (error) {
        next(error);
      }
    });
  });

  app.use(errorHandler);

  return app;
}
