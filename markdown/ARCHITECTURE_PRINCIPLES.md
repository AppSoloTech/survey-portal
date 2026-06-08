# Architecture Principles

## Technology Stack

Frontend:

* React
* TypeScript

Backend:

* Node.js
* Express
* TypeScript

Database:

* PostgreSQL

Authentication:

* JWT
* bcrypt

Hosting:

* Azure App Service
* Azure PostgreSQL Flexible Server

---

# Architectural Philosophy

The architecture should prioritize:

1. Simplicity
2. Maintainability
3. Security
4. Extensibility
5. Operational reliability

Avoid introducing complexity before it is required.

---

# Monolithic First

This project should begin as a modular monolith.

Preferred deployment:

React Frontend
+
Express Backend
+
PostgreSQL Database

The React application should be served by the Express application.

Avoid:

* microservices
* event buses
* message queues
* distributed architectures

unless explicitly required later.

---

# Database First Design

Survey behavior should be data-driven.

Administrators should be able to:

* create surveys
* edit surveys
* configure questions
* configure answer options
* configure conditional logic

without code changes.

Survey definitions should live in PostgreSQL.

Avoid hardcoded survey logic.

---

# Hidden Tag Principle

Tags must be stored in the database.

Tags must be associated with answer options.

Tags must never be exposed to survey participants.

Tags exist to support:

* reporting
* filtering
* business analysis
* future rule systems

---

# Conditional Logic Principle

Conditional logic should be data-driven.

Logic rules should be stored in the database.

Example:

IF Question A = Yes

THEN Jump To Question D

The survey engine should evaluate rules dynamically.

Avoid hardcoded survey-specific navigation.

---

# Authentication Principle

Authentication is server-controlled.

Passwords must never be stored in plaintext.

Use:

* bcrypt hashing
* JWT authentication
* server-side authorization

Protected resources must verify identity and role.

Frontend route protection alone is insufficient.

---

# Authorization Principle

Every API endpoint should verify:

* authentication
* authorization

Admin functionality must not be accessible to standard users.

Authorization must be enforced on the server.

---

# API Design Principles

Use REST APIs.

Prefer predictable resource naming.

Examples:

GET /api/surveys

GET /api/surveys/:id

POST /api/surveys

PUT /api/surveys/:id

DELETE /api/surveys/:id

Avoid unnecessary API complexity.

---

# Database Principles

Use relational modeling.

Maintain explicit foreign keys.

Prefer normalization unless a clear performance reason exists.

Store:

* surveys
* questions
* answer options
* conditional rules
* survey responses
* survey statuses

as separate entities.

Avoid JSON blobs for core business data.

---

# Error Handling Principles

All API endpoints should:

* validate input
* return meaningful errors
* log failures

Unexpected errors should not expose implementation details.

---

# Security Principles

Never trust frontend validation.

Validate all incoming requests.

Use:

* parameterized SQL
* request validation
* role verification

Protect against:

* SQL injection
* privilege escalation
* unauthorized data access

---

# Azure Principles

Deploy:

* React frontend
* Express backend

to a single Azure App Service during MVP.

Use:

* Azure App Service environment variables
* Azure PostgreSQL Flexible Server

Store secrets in Azure configuration.

Do not store production secrets in source control.

---

# AI Development Principles

Codex is the implementation assistant.

Claude Code is the review assistant.

AI tools must:

* follow architecture documents
* stay within phase scope
* avoid speculative implementation
* avoid introducing unrelated technologies

The human developer remains responsible for:

* architecture decisions
* testing
* deployment
* final approval

---

# Decision Rule

When evaluating architecture decisions, prefer the solution that:

1. Improves maintainability
2. Improves security
3. Reduces operational complexity
4. Supports future survey flexibility
5. Keeps the MVP understandable

Reject solutions that introduce unnecessary complexity without a clear business requirement.
