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
  "answer_options",
  "survey_questions",
  "surveys",
  "users"
];

beforeEach(async () => {
  const { pool } = await import("../../src/db.js");
  await pool.query(`truncate ${dataTables.join(", ")} restart identity cascade`);
});

afterAll(async () => {
  const { pool } = await import("../../src/db.js");
  await pool.end();
});
