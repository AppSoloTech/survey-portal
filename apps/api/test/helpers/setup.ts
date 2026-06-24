import { afterAll, beforeEach } from "vitest";

import { applyTestEnvironment } from "./testDatabaseUrl.js";

// Point the API at the test database before any test file imports the app.
applyTestEnvironment();

const dataTables = [
  "survey_attempt_activity_events",
  "survey_response_selected_options",
  "survey_response_answers",
  "survey_attempts",
  "password_reset_tokens",
  "user_profiles",
  "anonymous_rate_limits",
  "survey_timing_overrides",
  "anonymous_survey_links",
  "conditional_logic_rules",
  "answer_tags",
  "question_value_tags",
  "question_other_tags",
  "answer_options",
  "survey_questions",
  "survey_pages",
  "tag_definitions",
  "tag_groups",
  "surveys",
  "survey_categories",
  "users"
];

beforeEach(async () => {
  const { pool, resetDatabaseHealthCheckForTests } = await import("../../src/db.js");
  const { resetAnonymousSurveyRateLimiterForTests } = await import(
    "../../src/routes/anonymousSurveyRoutes.js"
  );
  const { resetAuthRateLimitersForTests } = await import("../../src/routes/auth.js");

  resetDatabaseHealthCheckForTests();
  await Promise.all([resetAuthRateLimitersForTests(), resetAnonymousSurveyRateLimiterForTests()]);
  await pool.query(`truncate ${dataTables.join(", ")} restart identity cascade`);
});

afterAll(async () => {
  const { pool } = await import("../../src/db.js");
  await pool.end();
});
