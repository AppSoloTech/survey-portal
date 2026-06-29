import crypto from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import bcrypt from "bcrypt";

import {
  confirmWriteIfNeeded,
  loadtestDir,
  printTargetSummary,
  resolveLoadtestConfig
} from "./lib/env.mjs";
import { assertSchemaMigrationsIncludePhase49, createLoadtestPool } from "./lib/pg.mjs";

const password = "loadtest-password-123";

async function main() {
  const config = resolveLoadtestConfig();
  printTargetSummary(config, "seed load-test data");
  await confirmWriteIfNeeded(config, "Seed load-test data");

  const pool = createLoadtestPool(config);

  try {
    await assertSchemaMigrationsIncludePhase49(pool);
    const manifest = await seedData(pool, config);
    mkdirSync(loadtestDir, { recursive: true });
    writeFileSync(manifestPath(config.runKey), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Seeded load-test data for ${config.runKey}`);
    console.log(`Manifest: ${manifestPath(config.runKey)}`);
    console.log(`Admin email: ${manifest.admin.email}`);
    console.log(`Anonymous token: ${manifest.anonymous.publicToken}`);
  } finally {
    await pool.end();
  }
}

export async function seedData(pool, config) {
  const existing = await pool.query(
    `select id
     from surveys
     where title like $1
     limit 1`,
    [`${config.marker}%`]
  );

  if (existing.rowCount > 0) {
    throw new Error(`Load-test data for ${config.runKey} already exists. Run teardown first.`);
  }

  const client = await pool.connect();
  const adminEmail = config.adminEmail || `loadtest+${config.runKey}-admin@example.invalid`;
  const adminPassword = config.adminPassword || password;
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const participantCount = Math.max(config.completedAttempts, 1);
  const anonymousToken = generateAnonymousLinkToken();
  const manifest = {
    runKey: config.runKey,
    marker: config.marker,
    createdAt: new Date().toISOString(),
    admin: { id: null, email: adminEmail, password: adminPassword },
    users: [],
    categoryId: null,
    surveyId: null,
    pageIds: [],
    questionIds: {},
    optionIds: {},
    attemptIds: [],
    anonymous: {
      linkId: null,
      publicToken: anonymousToken.token
    }
  };

  try {
    await client.query("begin");

    const admin = await client.query(
      `insert into users (first_name, last_name, email, password_hash, role)
       values ('Loadtest', 'Admin', $1, $2, 'admin')
       returning id`,
      [adminEmail, passwordHash]
    );
    manifest.admin.id = admin.rows[0].id;

    const category = await client.query(
      `insert into survey_categories (name)
       values ($1)
       returning id`,
      [`${config.marker} category`]
    );
    manifest.categoryId = category.rows[0].id;

    const survey = await client.query(
      `insert into surveys (
         title,
         description,
         status,
         category_id,
         created_by_user_id,
         published_at
       )
       values ($1, $2, 'published', $3, $4, now())
       returning id`,
      [
        `${config.marker} survey`,
        "Fake load-test survey data. Safe to delete with loadtest:teardown.",
        manifest.categoryId,
        manifest.admin.id
      ]
    );
    manifest.surveyId = survey.rows[0].id;

    const pageInputs = [
      ["Operations", 1],
      ["Compliance", 2],
      ["Follow-up", 3]
    ];

    for (const [title, order] of pageInputs) {
      const page = await client.query(
        `insert into survey_pages (survey_id, title, display_order)
         values ($1, $2, $3)
         returning id`,
        [manifest.surveyId, title, order]
      );
      manifest.pageIds.push(page.rows[0].id);
    }

    const textQuestion = await insertQuestion(client, manifest, {
      pageIndex: 0,
      text: "Describe the site condition",
      type: "text",
      displayOrder: 1
    });
    const integerQuestion = await insertQuestion(client, manifest, {
      pageIndex: 0,
      text: "How many open issues were found?",
      type: "integer",
      displayOrder: 2
    });
    const singleQuestion = await insertQuestion(client, manifest, {
      pageIndex: 1,
      text: "Is follow-up required?",
      type: "single_select",
      displayOrder: 1
    });
    const multiQuestion = await insertQuestion(client, manifest, {
      pageIndex: 2,
      text: "Which remediation areas apply?",
      type: "multi_select",
      displayOrder: 1,
      allowOther: true
    });

    manifest.questionIds = {
      text: textQuestion,
      integer: integerQuestion,
      single: singleQuestion,
      multi: multiQuestion
    };
    manifest.optionIds.single = await insertOptions(client, singleQuestion, [
      ["Yes", 1],
      ["No", 2]
    ]);
    manifest.optionIds.multi = await insertOptions(client, multiQuestion, [
      ["Training", 1],
      ["Equipment", 2],
      ["Documentation", 3]
    ]);

    await client.query(
      `insert into answer_tags (answer_option_id, tag_key, tag_value)
       values ($1, 'loadtest_follow_up', 'yes')`,
      [manifest.optionIds.single[0]]
    );
    await client.query(
      `insert into question_value_tags (question_id, integer_min, integer_max, tag_key, tag_value)
       values ($1, 1, null, 'loadtest_issue_count', 'nonzero')`,
      [integerQuestion]
    );
    await client.query(
      `insert into question_other_tags (question_id, tag_key, tag_value)
       values ($1, 'loadtest_other', 'provided')`,
      [multiQuestion]
    );

    for (let index = 0; index < participantCount; index += 1) {
      const userEmail = `loadtest+${config.runKey}-${index + 1}@example.invalid`;
      const user = await client.query(
        `insert into users (first_name, last_name, email, password_hash, role)
         values ($1, 'Participant', $2, $3, 'user')
         returning id`,
        [`Loadtest ${index + 1}`, userEmail, passwordHash]
      );
      const userId = user.rows[0].id;
      manifest.users.push({ id: userId, email: userEmail });

      const attempt = await client.query(
        `insert into survey_attempts (
           survey_id,
           user_id,
           status,
           started_at,
           last_activity_at,
           completed_at
         )
         values ($1, $2, 'completed', now() - ($3::int * interval '1 minute'), now(), now())
         returning id`,
        [manifest.surveyId, userId, index + 1]
      );
      const attemptId = attempt.rows[0].id;
      manifest.attemptIds.push(attemptId);
      await insertCompletedAnswers(client, manifest, attemptId, index);
    }

    const anonymousLink = await client.query(
      `insert into anonymous_survey_links (
         survey_id,
         token_lookup_key,
         token_secret_hash,
         public_token,
         enabled,
         listed_in_public_directory,
         created_by_user_id
       )
       values ($1, $2, $3, $4, true, true, $5)
       returning id`,
      [
        manifest.surveyId,
        anonymousToken.lookupKey,
        anonymousToken.secretHash,
        anonymousToken.token,
        manifest.admin.id
      ]
    );
    manifest.anonymous.linkId = anonymousLink.rows[0].id;

    await client.query("commit");
    return manifest;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function manifestPath(runKey) {
  return path.join(loadtestDir, `.manifest.${runKey}.json`);
}

async function insertQuestion(client, manifest, input) {
  const result = await client.query(
    `insert into survey_questions (
       survey_id,
       page_id,
       question_text,
       question_type,
       display_order,
       is_required,
       allow_other
     )
     values ($1, $2, $3, $4, $5, true, $6)
     returning id`,
    [
      manifest.surveyId,
      manifest.pageIds[input.pageIndex],
      input.text,
      input.type,
      input.displayOrder,
      input.allowOther ?? false
    ]
  );

  return result.rows[0].id;
}

async function insertOptions(client, questionId, options) {
  const ids = [];

  for (const [text, order] of options) {
    const result = await client.query(
      `insert into answer_options (question_id, option_text, display_order)
       values ($1, $2, $3)
       returning id`,
      [questionId, text, order]
    );
    ids.push(result.rows[0].id);
  }

  return ids;
}

async function insertCompletedAnswers(client, manifest, attemptId, index) {
  await insertAnswer(client, attemptId, manifest.questionIds.text, {
    answerText: `Load-test response ${index + 1}`,
    answerInteger: null
  });
  await insertAnswer(client, attemptId, manifest.questionIds.integer, {
    answerText: null,
    answerInteger: (index % 5) + 1
  });
  const singleAnswerId = await insertAnswer(client, attemptId, manifest.questionIds.single, {
    answerText: null,
    answerInteger: null
  });
  await client.query(
    `insert into survey_response_selected_options (survey_response_answer_id, answer_option_id)
     values ($1, $2)`,
    [singleAnswerId, manifest.optionIds.single[index % 2]]
  );
  const multiAnswerId = await insertAnswer(client, attemptId, manifest.questionIds.multi, {
    answerText: null,
    answerInteger: null,
    otherText: index % 3 === 0 ? "Other load-test remediation" : null
  });
  await client.query(
    `insert into survey_response_selected_options (survey_response_answer_id, answer_option_id)
     values ($1, $2), ($1, $3)`,
    [
      multiAnswerId,
      manifest.optionIds.multi[index % manifest.optionIds.multi.length],
      manifest.optionIds.multi[(index + 1) % manifest.optionIds.multi.length]
    ]
  );
}

async function insertAnswer(client, attemptId, questionId, value) {
  const result = await client.query(
    `insert into survey_response_answers (
       survey_attempt_id,
       question_id,
       answer_text,
       answer_integer,
       other_text
     )
     values ($1, $2, $3, $4, $5)
     returning id`,
    [attemptId, questionId, value.answerText, value.answerInteger, value.otherText ?? null]
  );

  return result.rows[0].id;
}

function generateAnonymousLinkToken() {
  const lookupKey = crypto.randomBytes(12).toString("base64url");
  const secret = crypto.randomBytes(32).toString("base64url");

  return {
    lookupKey,
    secret,
    token: `asl.${lookupKey}.${secret}`,
    secretHash: crypto.createHash("sha256").update(secret).digest("hex")
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`loadtest:seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
