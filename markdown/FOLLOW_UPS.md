# Follow-Up Backlog

This file tracks accepted loose ends that should not be forgotten when a phase moves on without implementing them.

Review this file before starting each implementation phase. When a follow-up is completed, move it to the completed section with the phase or commit that resolved it.

---

## Active Follow-Ups

### Auth And Security

- Add rate limiting to `/api/auth/login` and `/api/auth/register` before public exposure or hosted deployment.
- Add maximum password length validation to avoid bcrypt's 72-byte truncation edge case.
- Decide whether to migrate from local-storage bearer JWTs to httpOnly, SameSite cookie auth before real survey response data or hidden-tag metadata exists.
- Add an automated backend auth test harness before auth-sensitive behavior grows further.

### Environment And Deployment

- Update `/api/health` readiness semantics before Azure health checks rely on it. Either return non-2xx when PostgreSQL is unavailable or split liveness/readiness endpoints.
- Add a real admin seed or provisioning workflow before hosted use.
- Choose a database migration runner before deployment workflow becomes repetitive.

### API And Code Quality

- Centralize repeated user SELECT projections if auth query reuse grows.
- Avoid the redundant `/api/auth/me` fetch immediately after login/register.
- Consider moving the full health response shape, including database status, into `packages/shared`.
- Either query `app_health_check` from the health check or document the table as a migration-pipeline placeholder.

### Frontend Validation

- Run browser-based route and layout inspection when a browser automation setup is available.

---

## Completed Follow-Ups

- None yet.
