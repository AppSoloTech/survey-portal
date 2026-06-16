import { afterAll, beforeEach } from "vitest";

import { applyTestEnvironment } from "./testDatabaseUrl.js";

// Point the API at the test database before any test file imports the app.
applyTestEnvironment();

const dataTables = [
  "survey_response_selected_options",
  "survey_response_answers",
  "survey_attempts",
  "conditional_logic_rules",
  "answer_tags",
  "question_value_tags",
  "answer_options",
  "survey_questions",
  "survey_pages",
  "tag_definitions",
  "surveys",
  "survey_categories",
  "users"
];

beforeEach(async () => {
  const { pool, resetDatabaseHealthCheckForTests } = await import("../../src/db.js");
  const { resetAuthRateLimitersForTests } = await import("../../src/routes/auth.js");

  resetDatabaseHealthCheckForTests();
  await resetAuthRateLimitersForTests();
  await pool.query(`truncate ${dataTables.join(", ")} restart identity cascade`);
});

afterAll(async () => {
  const { pool } = await import("../../src/db.js");
  await pool.end();
});
