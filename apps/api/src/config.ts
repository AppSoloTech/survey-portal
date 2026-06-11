import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../.env");
const workspaceEnvPath = path.resolve(__dirname, "../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: workspaceEnvPath });

type RunEnvironment = "dev" | "prod";
const localJwtSecretPlaceholder = "replace_with_a_local_development_secret";

function readRunEnv(): RunEnvironment {
  const value = process.env.RUN_ENV ?? "dev";

  if (value !== "dev" && value !== "prod") {
    throw new Error("RUN_ENV must be either dev or prod");
  }

  return value;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readDatabaseUrl(runEnv: RunEnvironment): string {
  if (runEnv === "prod") {
    return (
      process.env.HOSTED_DATABASE_URL ??
      process.env.DATABASE_URL ??
      buildDatabaseUrlFromParts()
    );
  }

  return (
    process.env.LOCAL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    buildDatabaseUrlFromParts()
  );
}

// Hosted environments may supply discrete DB_* settings instead of a
// connection string; user and password are URL-encoded here so special
// characters never need manual escaping.
function buildDatabaseUrlFromParts(): string {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!host || !database || !user || !password) {
    throw new Error(
      "Database configuration is required: set DATABASE_URL (or HOSTED_DATABASE_URL), or set DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD"
    );
  }

  const port = process.env.DB_PORT ?? "5432";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function readOptionalDatabaseSslCa(): string | undefined {
  const inlineCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");

  if (inlineCa) {
    return inlineCa;
  }

  const caPath = process.env.DATABASE_SSL_CA_PATH;

  if (!caPath) {
    return undefined;
  }

  return fs.readFileSync(caPath, "utf8");
}

function readJwtSecret(runEnv: RunEnvironment): string {
  const value = readRequiredEnv("JWT_SECRET");

  if (runEnv === "prod") {
    if (value === localJwtSecretPlaceholder) {
      throw new Error("JWT_SECRET must not use the local placeholder when RUN_ENV is prod");
    }

    if (value.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters when RUN_ENV is prod");
    }
  }

  return value;
}

function readNonNegativeIntegerEnv(name: string, defaultValue: number): number {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

function readPositiveIntegerEnv(name: string, defaultValue: number): number {
  const value = readNonNegativeIntegerEnv(name, defaultValue);

  if (value === 0) {
    throw new Error(`${name} must be greater than 0`);
  }

  return value;
}

const runEnv = readRunEnv();
const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = runEnv === "prod";

if (isProduction && nodeEnv !== "production") {
  throw new Error("NODE_ENV must be production when RUN_ENV is prod");
}

export const config = {
  nodeEnv,
  runEnv,
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  // Hosted platforms route traffic into the container from outside, so
  // production must bind all interfaces; dev stays loopback-only.
  host: process.env.API_HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1"),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  databaseUrl: readDatabaseUrl(runEnv),
  databaseSslCa: readOptionalDatabaseSslCa(),
  jwtSecret: readJwtSecret(runEnv),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  trustProxyHops: readNonNegativeIntegerEnv(
    "TRUST_PROXY_HOPS",
    runEnv === "prod" ? 1 : 0
  ),
  authRateLimitWindowMs: readPositiveIntegerEnv(
    "AUTH_RATE_LIMIT_WINDOW_MS",
    15 * 60 * 1000
  ),
  authLoginRateLimitMax: readPositiveIntegerEnv("AUTH_LOGIN_RATE_LIMIT_MAX", 5),
  authRegisterRateLimitMax: readPositiveIntegerEnv("AUTH_REGISTER_RATE_LIMIT_MAX", 5)
} as const;
