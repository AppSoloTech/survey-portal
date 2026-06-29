import http from "k6/http";
import { check } from "k6";

export function login(baseUrl, email, password) {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" } }
  );

  check(response, {
    "admin login succeeded": (res) => res.status === 200
  });

  return response.cookies.survey_portal_auth?.[0]
    ? `survey_portal_auth=${response.cookies.survey_portal_auth[0].value}`
    : "";
}

