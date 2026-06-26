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
export type EmailProvider = "disabled" | "noop";
export type DictionaryProvider = "disabled" | "merriam-webster";
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

function readBooleanEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: boolean
): boolean {
  const rawValue = env[name];

  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  throw new Error(`${name} must be either true or false`);
}

function readEmailProvider(rawValue: string | undefined, enabled: boolean): EmailProvider {
  const value = rawValue ?? (enabled ? undefined : "disabled");

  // Keep this accepted-provider list in sync with createEmailClient. The
  // enabled/disabled matrix is checked below in readEmailConfigFromEnv.
  if (value === "disabled" || value === "noop") {
    return value;
  }

  if (!value) {
    throw new Error("EMAIL_PROVIDER is required when EMAIL_ENABLED is true");
  }

  throw new Error("EMAIL_PROVIDER must be either disabled or noop");
}

function readDictionaryProvider(rawValue: string | undefined): DictionaryProvider {
  const value = rawValue ?? "disabled";

  if (value === "disabled" || value === "merriam-webster") {
    return value;
  }

  throw new Error("DICTIONARY_PROVIDER must be either disabled or merriam-webster");
}

export function readDictionaryConfigFromEnv(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === "test") {
    return {
      provider: "disabled",
      merriamWebsterCollegiateApiKey: undefined
    } as const;
  }

  const provider = readDictionaryProvider(env.DICTIONARY_PROVIDER);
  const merriamWebsterCollegiateApiKey =
    env.MERRIAM_WEBSTER_COLLEGIATE_API_KEY || undefined;

  if (provider === "merriam-webster" && !merriamWebsterCollegiateApiKey) {
    throw new Error(
      "MERRIAM_WEBSTER_COLLEGIATE_API_KEY is required when DICTIONARY_PROVIDER=merriam-webster"
    );
  }

  return {
    provider,
    merriamWebsterCollegiateApiKey
  } as const;
}

export function readEmailConfigFromEnv(
  env: NodeJS.ProcessEnv,
  runEnv: RunEnvironment
) {
  const enabled = readBooleanEnv(env, "EMAIL_ENABLED", false);
  const provider = readEmailProvider(env.EMAIL_PROVIDER, enabled);

  // This matrix check keeps the disabled env state distinct from enabled
  // provider adapters as real delivery providers are added.
  if (!enabled && provider !== "disabled") {
    throw new Error("EMAIL_PROVIDER must be disabled when EMAIL_ENABLED is false");
  }

  if (enabled && provider === "disabled") {
    throw new Error("EMAIL_PROVIDER must not be disabled when EMAIL_ENABLED is true");
  }

  if (enabled && runEnv === "prod") {
    throw new Error(
      "Real email provider integration is not implemented yet; keep EMAIL_ENABLED=false in production"
    );
  }

  return {
    enabled,
    provider,
    fromAddress: env.EMAIL_FROM_ADDRESS || undefined,
    replyToAddress: env.EMAIL_REPLY_TO_ADDRESS || undefined
  } as const;
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
  anonymousLinkTokenEncryptionSecret:
    process.env.ANONYMOUS_LINK_TOKEN_ENCRYPTION_SECRET || readJwtSecret(runEnv),
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
  authRegisterRateLimitMax: readPositiveIntegerEnv("AUTH_REGISTER_RATE_LIMIT_MAX", 5),
  anonymousSurveyRateLimitWindowMs: readPositiveIntegerEnv(
    "ANONYMOUS_SURVEY_RATE_LIMIT_WINDOW_MS",
    15 * 60 * 1000
  ),
  anonymousSurveyRateLimitMax: readPositiveIntegerEnv(
    "ANONYMOUS_SURVEY_RATE_LIMIT_MAX",
    120
  ),
  dictionary: readDictionaryConfigFromEnv(process.env),
  email: readEmailConfigFromEnv(process.env, runEnv)
} as const;
