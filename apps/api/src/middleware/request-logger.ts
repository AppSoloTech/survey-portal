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
  const redactedPath = originalUrl
    .replace(/^\/api\/anonymous-surveys\/[^/?#]+/, "/api/anonymous-surveys/[token]")
    .replace(/^\/reset-password\?token=[^&#]+/, "/reset-password?token=[token]");

  try {
    const url = new URL(redactedPath, "http://survey-portal.local");

    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveQueryKey(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return redactedPath.replace(
      /(token|secret|password|email|reset|attempt)=([^&#]+)/gi,
      "$1=[redacted]"
    );
  }
}

function isSensitiveQueryKey(key: string): boolean {
  return /(token|secret|password|email|reset|attempt)/i.test(key);
}
