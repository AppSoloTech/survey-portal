import type { RequestHandler } from "express";

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.info(`${req.method} ${sanitizeUrl(req.originalUrl)} ${res.statusCode} ${durationMs}ms`);
  });

  next();
};

function sanitizeUrl(originalUrl: string): string {
  return originalUrl
    .replace(/^\/api\/anonymous-surveys\/[^/?#]+/, "/api/anonymous-surveys/[token]")
    .replace(/^\/reset-password\?token=[^&#]+/, "/reset-password?token=[token]");
}
