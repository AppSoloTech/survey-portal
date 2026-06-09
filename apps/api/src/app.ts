import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { surveysRouter } from "./routes/surveys.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(express.json({ limit: "100kb" }));

  if (!config.isProduction) {
    app.use(
      cors({
        origin: config.webOrigin
      })
    );
  }

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/surveys", surveysRouter);

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
