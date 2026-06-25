import crypto from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { authCookieName } from "../auth.js";
import { config } from "../config.js";

const csrfCookieName = "survey_portal_csrf";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfHeaderName = "x-csrf-token";

export function applySecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy());

  if (config.isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

export function enforceBrowserRequestSecurity(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!unsafeMethods.has(req.method)) {
    next();
    return;
  }

  const browserOrigin = readBrowserOrigin(req);

  if (!browserOrigin) {
    next();
    return;
  }

  if (!isAllowedBrowserOrigin(browserOrigin)) {
    res.status(403).json({ error: "Request origin is not allowed" });
    return;
  }

  if (isCsrfExempt(req.path)) {
    next();
    return;
  }

  const cookieToken = readCookie(req.get("cookie"), csrfCookieName);
  const headerToken = req.get(csrfHeaderName);

  if (!cookieToken || !headerToken || !verifyCsrfCookie(cookieToken, headerToken)) {
    res.status(403).json({ error: "CSRF token is invalid or missing" });
    return;
  }

  next();
}

export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(32).toString("base64url");

  res.cookie(csrfCookieName, signCsrfToken(token), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.isProduction
  });

  return token;
}

export function clearCsrfCookie(res: Response): void {
  res.clearCookie(csrfCookieName, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.isProduction
  });
}

function isCsrfExempt(path: string): boolean {
  return path.startsWith("/api/anonymous-surveys/");
}

function readBrowserOrigin(req: Request): string | null {
  const origin = req.get("origin");

  if (origin) {
    return normalizeOrigin(origin);
  }

  const referer = req.get("referer");

  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isAllowedBrowserOrigin(browserOrigin: string): boolean {
  return isAllowedBrowserOriginForConfig(browserOrigin, {
    isProduction: config.isProduction,
    webOrigin: config.webOrigin
  });
}

export function isAllowedBrowserOriginForConfig(
  browserOrigin: string,
  input: { isProduction: boolean; webOrigin: string }
): boolean {
  const webOrigin = normalizeOrigin(input.webOrigin);

  if (browserOrigin === webOrigin) {
    return true;
  }

  return !input.isProduction && isEquivalentLoopbackOrigin(browserOrigin, webOrigin);
}

function isEquivalentLoopbackOrigin(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);

    return (
      leftUrl.protocol === rightUrl.protocol &&
      leftUrl.port === rightUrl.port &&
      isLoopbackHost(leftUrl.hostname) &&
      isLoopbackHost(rightUrl.hostname)
    );
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

function buildContentSecurityPolicy(): string {
  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["object-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["form-action", "'self'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'", "https://fonts.gstatic.com"],
    ["style-src", "'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    ["script-src", "'self'"],
    ["connect-src", "'self'"],
    ["worker-src", "'self'", "blob:"],
    ["upgrade-insecure-requests"]
  ];

  return directives.map((directive) => directive.join(" ")).join("; ");
}

function signCsrfToken(token: string): string {
  const signature = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(token)
    .digest("base64url");

  return `${token}.${signature}`;
}

function verifyCsrfCookie(cookieValue: string, headerToken: string): boolean {
  const expected = signCsrfToken(headerToken);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(cookieValue);

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }

  for (const cookie of header.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");

    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function hasAuthCookie(req: Request): boolean {
  return Boolean(readCookie(req.get("cookie"), authCookieName));
}
