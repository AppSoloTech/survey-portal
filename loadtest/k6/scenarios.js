import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

import { login } from "./lib/auth.js";

const profile = __ENV.LOADTEST_PROFILE || "smoke";
const baseUrl = (__ENV.LOADTEST_BASE_URL || "").replace(/\/+$/, "");
const surveyId = __ENV.LOADTEST_SURVEY_ID;
const anonymousToken = __ENV.LOADTEST_ANONYMOUS_TOKEN;
const vus = Number(__ENV.LOADTEST_VUS || "1");
const duration = __ENV.LOADTEST_DURATION || "30s";
const rampingStages = parseRampingStages(__ENV.LOADTEST_RAMPING_STAGES);
const http5xx = new Counter("http_5xx");

export const options = {
  scenarios: buildScenarios(profile),
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"],
    http_5xx: ["count<1"]
  }
};

export function setup() {
  return {
    adminCookie: login(baseUrl, __ENV.LOADTEST_ADMIN_EMAIL, __ENV.LOADTEST_ADMIN_PASSWORD)
  };
}

export default function (data) {
  if (profile === "write-heavy") {
    runAnonymousWriteFlow();
  } else if (profile === "mixed" && Math.random() < 0.5) {
    runAnonymousWriteFlow();
  } else {
    runReadHeavy(data.adminCookie);
  }

  sleep(1);
}

export function handleSummary(data) {
  if (!__ENV.LOADTEST_K6_SUMMARY_PATH) {
    return {};
  }

  return {
    [__ENV.LOADTEST_K6_SUMMARY_PATH]: JSON.stringify(data, null, 2)
  };
}

function runReadHeavy(adminCookie) {
  const headers = { Cookie: adminCookie };
  const responses = http.batch([
    ["GET", `${baseUrl}/api/surveys/${surveyId}`, null, { headers }],
    ["GET", `${baseUrl}/api/surveys/${surveyId}/report`, null, { headers }],
    ["GET", `${baseUrl}/api/surveys/${surveyId}/attempts`, null, { headers }],
    ["GET", `${baseUrl}/api/surveys/${surveyId}/export.csv`, null, { headers }]
  ]);

  for (const response of responses) {
    recordResponse(response);
    check(response, {
      "read endpoint returned 2xx": (res) => res.status >= 200 && res.status < 300
    });
  }
}

function runAnonymousWriteFlow() {
  const start = http.post(`${baseUrl}/api/anonymous-surveys/${anonymousToken}/start`);
  recordResponse(start);

  check(start, {
    "anonymous start succeeded": (res) => res.status === 201
  });

  if (start.status !== 201) {
    return;
  }

  let body = start.json();
  const survey = body.survey;
  const attemptId = body.attempt.id;
  const attemptAccessToken = body.attemptAccessToken;

  while (body.currentPage) {
    const pageId = body.currentPage.id;
    const questions = survey.questions.filter((question) => question.pageId === pageId);
    const answers = questions.map((question) => answerForQuestion(question));
    const save = http.post(
      `${baseUrl}/api/anonymous-surveys/${anonymousToken}/pages/${pageId}/answer`,
      JSON.stringify({ attemptId, attemptAccessToken, answers }),
      { headers: { "Content-Type": "application/json" } }
    );
    recordResponse(save);

    check(save, {
      "anonymous page save succeeded": (res) => res.status === 200
    });

    if (save.status !== 200) {
      return;
    }

    body = save.json();
  }

  const complete = http.post(
    `${baseUrl}/api/anonymous-surveys/${anonymousToken}/complete`,
    JSON.stringify({ attemptId, attemptAccessToken }),
    { headers: { "Content-Type": "application/json" } }
  );
  recordResponse(complete);

  check(complete, {
    "anonymous complete succeeded": (res) => res.status === 200
  });
}

function answerForQuestion(question) {
  if (question.questionType === "integer") {
    return {
      questionId: question.id,
      answerText: null,
      answerInteger: 1,
      selectedAnswerOptionIds: [],
      isOtherSelected: false,
      otherText: null
    };
  }

  if (question.questionType === "single_select") {
    return {
      questionId: question.id,
      answerText: null,
      answerInteger: null,
      selectedAnswerOptionIds: [question.answerOptions[0].id],
      isOtherSelected: false,
      otherText: null
    };
  }

  if (question.questionType === "multi_select") {
    return {
      questionId: question.id,
      answerText: null,
      answerInteger: null,
      selectedAnswerOptionIds: question.answerOptions.slice(0, 2).map((option) => option.id),
      isOtherSelected: false,
      otherText: null
    };
  }

  return {
    questionId: question.id,
    answerText: "k6 load-test answer",
    answerInteger: null,
    selectedAnswerOptionIds: [],
    isOtherSelected: false,
    otherText: null
  };
}

function buildScenarios(selectedProfile) {
  if (selectedProfile !== "smoke" && rampingStages.length > 0) {
    return {
      [selectedProfile]: {
        executor: "ramping-vus",
        stages: rampingStages
      }
    };
  }

  return {
    [selectedProfile]: {
      executor: "constant-vus",
      vus,
      duration
    }
  };
}

function recordResponse(response) {
  if (response.status >= 500) {
    http5xx.add(1);
  }
}

function parseRampingStages(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (stage) =>
        stage &&
        typeof stage.duration === "string" &&
        Number.isInteger(stage.target) &&
        stage.target >= 0
    );
  } catch {
    return [];
  }
}
