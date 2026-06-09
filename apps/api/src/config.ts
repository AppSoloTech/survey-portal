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
    return process.env.HOSTED_DATABASE_URL ?? readRequiredEnv("DATABASE_URL");
  }

  return (
    process.env.LOCAL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    buildLocalDatabaseUrl()
  );
}

function buildLocalDatabaseUrl(): string {
  const host = readRequiredEnv("DB_HOST");
  const port = process.env.DB_PORT ?? "5432";
  const database = readRequiredEnv("DB_NAME");
  const user = readRequiredEnv("DB_USER");
  const password = readRequiredEnv("DB_PASSWORD");

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
  host: process.env.API_HOST ?? "127.0.0.1",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  databaseUrl: readDatabaseUrl(runEnv),
  databaseSslCa: readOptionalDatabaseSslCa(),
  jwtSecret: readJwtSecret(runEnv),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h"
} as const;
