import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRootEnvPath = path.resolve(__dirname, "../../../../.env");

const defaultTestDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/survey_portal_test";

// Resolves the dedicated test database URL and refuses anything that does not
// look like a disposable test database. The harness never falls back to
// DATABASE_URL or LOCAL_DATABASE_URL.
export function resolveTestDatabaseUrl(): string {
  dotenv.config({ path: repoRootEnvPath });

  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl;

  let parsed: URL;

  try {
    parsed = new URL(testDatabaseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid postgresql:// connection URL");
  }

  const databaseName = parsed.pathname.replace(/^\//, "");

  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to run API tests against database "${databaseName}": the database name must contain "test". Set TEST_DATABASE_URL to a dedicated local test database.`
    );
  }

  for (const conflictingName of ["DATABASE_URL", "LOCAL_DATABASE_URL", "HOSTED_DATABASE_URL"]) {
    const conflictingValue = process.env[conflictingName];

    if (
      conflictingValue &&
      conflictingValue === testDatabaseUrl &&
      process.env.SURVEY_PORTAL_TEST_DATABASE_APPLIED !== "1"
    ) {
      throw new Error(
        `Refusing to run API tests: TEST_DATABASE_URL matches ${conflictingName}. Tests must use a dedicated test database.`
      );
    }
  }

  return testDatabaseUrl;
}

// The API config module reads the environment once at import time, so the
// test database must be injected before anything imports ../src/config.js.
export function applyTestEnvironment(): string {
  const testDatabaseUrl = resolveTestDatabaseUrl();

  process.env.RUN_ENV = "dev";
  process.env.LOCAL_DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test_only_jwt_secret_for_local_api_tests";
  process.env.SURVEY_PORTAL_TEST_DATABASE_APPLIED = "1";

  return testDatabaseUrl;
}
