# Data Model Vision

## Purpose

This document describes the intended data model for the Survey Portal MVP.

It is not a final migration script.

It exists to guide Codex, Claude Code, and human review so the database design stays aligned with the product goals.

The actual schema may evolve during implementation, but changes should preserve the core relationships described here.

---

# Survey Experience Decision

The survey-taking experience now supports page-based surveys:

```txt
one survey page per screen
```

Each page may contain one or more questions. The participant answers all visible
questions on the current page, then advances to the next page selected by
database-defined navigation rules or normal page order.

Earlier MVP phases used one question per page. Phase 11 migrates existing
surveys into one page per existing question to preserve behavior, then allows
admins to place multiple questions on a page.

This supports:

* survey rendering
* conditional logic
* progress tracking
* validation
* jump behavior
* mobile responsiveness
* user focus

The system may still support sections later, but pages are the primary
participant-facing unit.

---

# Navigation Decision

The data model should support both question-level and page-level navigation concepts.

The page-based MVP supports:

```txt
JUMP_TO_QUESTION
HIDE_QUESTION
JUMP_TO_PAGE
```

Future-supported rule actions may include:

```txt
SHOW_QUESTION
END_SURVEY
```

Do not implement these future actions unless explicitly requested in a later phase.

---

# Core Entities

## User

Represents a registered person who can authenticate into the system.

Users may be standard survey participants or administrators.

Suggested fields:

```txt
id
first_name
last_name
email
password_hash
role
created_at
updated_at
```

Role values:

```txt
user
admin
```

Notes:

* Email should be unique.
* Passwords must be stored as bcrypt hashes.
* Never store plaintext passwords.

---

## User Profile

Represents optional, user-owned profile metadata for a registered person.

Suggested fields:

```txt
id
user_id
contact_number
address_street
address_city
address_state
created_at
updated_at
```

Notes:

* Profile metadata belongs to one user and should use a foreign key to `users`.
* Core profile fields should remain relational columns, not JSON blobs.
* Contact fields are optional account metadata used for survey follow-up and
  should avoid broad CRM/account-management scope.
* `contact_number` is presented to users and admins as "Phone number".
* Address is stored as optional `address_street`, `address_city`, and
  `address_state` fields. These fields are structured enough for user clarity
  but intentionally stop short of address autocomplete, geocoding, postal-code
  validation, or broader CRM/account-management workflows.
* Earlier contact-method and contact-notes columns are legacy metadata and are
  not part of the cleaned-up self-service or admin read-only profile surface.
* Standard users may read and update only their own profile metadata.
* Admin profile viewing or editing is a separate admin-user-management concern,
  not part of the user-owned profile model.

---

## Survey

Represents a survey template created by an administrator.

Suggested fields:

```txt
id
title
description
status
created_by_user_id
created_at
updated_at
published_at
retired_at
```

Status values:

```txt
draft
published
retired
```

Notes:

* Users should only see published surveys.
* Draft surveys are admin-only.
* Retired surveys should no longer be available for new attempts.

---

## Survey Timing Override

Represents an Admin-entered total completion-time override for one survey.

Suggested fields:

```txt
survey_id
admin_override_seconds
created_by_user_id
updated_by_user_id
created_at
updated_at
```

Notes:

* Statistical and default estimates are derived by the backend at read time,
  not stored as duplicated survey metadata.
* Admin overrides are operational survey metadata and may be edited on
  published surveys without unlocking structural survey edits.
* Admin override seconds take precedence over statistical estimates, which take
  precedence over backend defaults.
* Participant-safe survey payloads may expose only the effective estimate, not
  derived/default/admin override audit fields, sample counts, or source labels.

---

## Survey Attempt Activity Event

Represents lightweight operational timing telemetry for a participant's survey
attempt.

Suggested fields:

```txt
id
survey_attempt_id
survey_id
page_id
question_id
event_type
visible_question_ids
occurred_at
created_at
```

Notes:

* Activity events are backend metadata used to improve future running time
  estimates; they should not affect response validation, completion, reporting
  counts, hidden tags, or CSV exports.
* Event types should stay coarse and safe, such as page entry, answer save,
  resume, heartbeat, and completion.
* Activity events must not store raw answer text, selected answer option values,
  hidden tags, contact email, or participant-identifying metadata beyond the
  owning attempt relationship.
* Anonymous activity writes must validate the anonymous link and per-attempt
  access token before inserting rows.
* Active-time aggregation should cap idle gaps between events before those gaps
  contribute to attempt or survey-level active seconds.
* Participant payloads should not expose activity rows or active-time internals.

---

## Survey Question

Represents a single question in a survey.

Questions belong to a survey page. Page order controls participant flow, and
question order controls display inside a page.

Suggested fields:

```txt
id
survey_id
page_id
question_text
question_type
allow_other
display_order
is_required
help_text
created_at
updated_at
```

Question type values:

```txt
text
integer
single_select
multi_select
```

Notes:

* `display_order` determines order within the owning page.
* The MVP should avoid hardcoded survey-specific questions.
* All survey questions should be database-driven.
* `allow_other` applies only to `single_select` and `multi_select`.
  It causes the participant UI to render a system-generated Other input without
  creating a normal answer option row.

---

## Survey Page

Represents a participant-facing page in a survey.

Suggested fields:

```txt
id
survey_id
title
description
display_order
created_at
updated_at
```

Notes:

* `display_order` determines default page progression.
* A page contains one or more questions when a survey is publishable.
* Existing one-question flow is represented as one page per question.

---

## Answer Option

Represents a selectable answer for single-select and multi-select questions.

Suggested fields:

```txt
id
question_id
option_text
display_order
created_at
updated_at
```

Notes:

* Text and integer questions do not require answer options.
* Answer options are visible to survey participants.
* Hidden tags are not stored directly in option text.

---

## Answer Tag

Represents hidden metadata attached to a selectable answer option.

Suggested fields:

```txt
id
answer_option_id
tag_key
tag_value
created_at
updated_at
```

Examples:

```txt
tag_key: compliance_result
tag_value: violation

tag_key: severity
tag_value: high

tag_key: review_required
tag_value: true
```

Notes:

* Tags must never be visible to survey participants.
* Tags are primarily for admin reporting and analytics.
* Tags belong to answer options, not to the displayed question text.
* A single answer option may have zero, one, or many tags.
* The persisted `tag_key` field is presented to administrators as the tag
  category; user-facing admin copy should describe pairs as tag category/value
  pairs.

---

## Tag Definition

Represents one reusable catalog category/value pair available to administrators
as a hidden-tag suggestion.

Suggested fields:

```txt
id
tag_key
tag_value
group_id
display_order
created_at
updated_at
```

Notes:

* Tag definitions are admin-only catalog metadata.
* A tag definition stores the category/value pair together; category and value
  should not be split into separately groupable objects.
* `group_id` is nullable. A null value means the pair lives in the public
  ungrouped catalog holding area.
* A tag definition may belong to at most one tag group.
* Deleting a catalog definition does not delete hidden tags already saved on
  answer options, Other metadata, value tags, responses, reports, or CSV rows.
* Builder-saved hidden tags continue to auto-register catalog definitions and
  enter the ungrouped holding area by default.

---

## Tag Group

Represents an admin-managed catalog grouping for reusable tag definitions.

Suggested fields:

```txt
id
name
display_order
created_at
updated_at
```

Notes:

* Tag groups are admin-only organization metadata for `/admin/tags`.
* Tag groups are not participant-facing and should not appear in participant
  survey payloads, reports, CSV exports, response storage, or hidden-tag
  matching behavior.
* Deleting a tag group does not delete tag definitions; grouped definitions
  return to the ungrouped catalog holding area.

---

## Question Other Tag

Represents hidden metadata attached to the system-generated Other choice on a
selection question.

Suggested fields:

```txt
id
question_id
tag_key
tag_value
created_at
updated_at
```

Notes:

* Other tags belong to the question, not to an `answer_options` row.
* They apply only when `allow_other = true` and a saved response has non-null
  `other_text`.
* They do not make Other editable, selectable as a normal answer option, or
  usable by option-based conditional logic.
* Tags must never be visible to survey participants.

---

## Conditional Logic Rule

Represents a rule that changes survey navigation based on a prior answer.

MVP action:

```txt
JUMP_TO_QUESTION
```

Suggested fields:

```txt
id
survey_id
source_question_id
source_answer_option_id
condition_operator
action_type
target_question_id
target_page_id
created_at
updated_at
```

Condition operator values for MVP:

```txt
equals
```

Action type values:

```txt
JUMP_TO_QUESTION
JUMP_TO_PAGE
SHOW_QUESTION
HIDE_QUESTION
END_SURVEY
```

MVP implementation requirement:

* Only implement `JUMP_TO_QUESTION`.
* Other action types may exist as enum values or documented future values, but should not be built into the survey runner yet.

Notes:

* For single-select questions, the rule triggers when the selected answer option matches.
* For multi-select questions, the rule may trigger if the selected set contains the source answer option.
* Avoid complex multi-condition rule groups during MVP.
* Avoid formula engines during MVP.

---

## Survey Attempt

Represents one user’s attempt to complete a survey.

Suggested fields:

```txt
id
survey_id
user_id
anonymous_link_id
anonymous_access_token_hash
anonymous_contact_email
status
started_at
last_activity_at
completed_at
created_at
updated_at
```

Status values:

```txt
not_started
in_progress
completed
abandoned
```

Notes:

* A registered attempt is owned by `user_id`.
* An anonymous attempt is owned by `anonymous_link_id` plus a hashed per-attempt
  access token.
* An anonymous attempt may optionally store `anonymous_contact_email` after
  completion so admins can follow up without creating a user account.
* Exactly one ownership path should be set: registered user or anonymous link.
* A user may have one or more attempts depending on business rules.
* For MVP, consider limiting each user to one active attempt per survey.
* Admins need to see whether a user has started, completed, or abandoned a survey.

---

## Anonymous Survey Link

Represents a tokenized public entry point to a published survey.

Suggested fields:

```txt
id
survey_id
token_lookup_key
token_secret_hash
public_token
enabled
listed_in_public_directory
expires_at
created_by_user_id
disabled_at
created_at
updated_at
```

Notes:

* Anonymous links are admin-created and scoped to one published survey.
* Public directory listing is an explicit per-link Admin opt-in through
  `listed_in_public_directory`. The default is false so enabled tokenized links
  remain unlisted unless an Admin lists that specific link.
* The public URL token should be high entropy.
* Store a lookup key plus a hash of the token secret for validation.
* Store the complete public token encrypted at rest for admin-only reveal/copy
  in Setup. Older links created before this field exists cannot be
  reconstructed from hashes.
* `public_token` uses application-layer authenticated encryption. If the
  encryption secret changes, existing links still validate through their hash
  but cannot be revealed for copying.
* Anonymous takers do not receive or create user accounts.
* Public anonymous survey APIs must return the same participant-safe survey
  shape as logged-in survey-taking APIs: hidden tags and admin-only metadata are
  not included.
* The public anonymous directory may expose only participant-safe listing fields
  for eligible links, such as survey title, public survey description, category
  name, expiration display data, and the public runner URL. It must not expose
  hidden tags, Admin notes, token hashes, attempt access tokens, profile contact
  fields, or the full survey structure.
* Disabled, expired, draft, retired, deleted, or otherwise unavailable links
  should produce a safe unavailable response.

---

## Survey Response Answer

Represents an answer given by a user during a survey attempt.

Suggested fields:

```txt
id
survey_attempt_id
question_id
answer_text
answer_integer
other_text
created_at
updated_at
```

Notes:

* Text questions store the response in `answer_text`.
* Integer questions store the response in `answer_integer`.
* Choice-question custom Other responses store the participant-entered text in
  `other_text`. This text is response data, not an answer option, and should be
  null when Other is not selected.
* Selection-based questions should use a join table instead of storing selected option IDs as JSON.

---

## Survey Response Selected Option

Represents selected options for single-select and multi-select responses.

Suggested fields:

```txt
id
survey_response_answer_id
answer_option_id
created_at
```

Notes:

* Single-select questions should have one selected option.
* Multi-select questions may have multiple selected options.
* This table allows answer tags to be resolved through the selected answer options.
* System-generated Other responses are not stored in this table. Their hidden
  tags, when configured, resolve from question-level Other metadata and still
  cannot trigger option-based conditional logic.

---

# Optional Future Entity: Survey Page

The MVP does not need multiple questions per page.

However, if page-level navigation becomes important later, introduce a Survey Page entity.

Possible fields:

```txt
id
survey_id
title
description
display_order
created_at
updated_at
```

Then questions could optionally reference:

```txt
survey_page_id
```

For MVP, avoid implementing this unless needed.

---

# Suggested Relationship Summary

```txt
User
  has many SurveyAttempts
  may create many Surveys if admin

Survey
  has many SurveyQuestions
  has many ConditionalLogicRules
  has many SurveyAttempts
  has many AnonymousSurveyLinks

SurveyQuestion
  belongs to Survey
  has many AnswerOptions
  may be source or target of ConditionalLogicRules

AnswerOption
  belongs to SurveyQuestion
  has many AnswerTags
  may trigger ConditionalLogicRules
  may be selected in SurveyResponseSelectedOptions

SurveyAttempt
  belongs to User for registered attempts
  belongs to AnonymousSurveyLink for anonymous attempts
  belongs to Survey
  has many SurveyResponseAnswers

SurveyResponseAnswer
  belongs to SurveyAttempt
  belongs to SurveyQuestion
  has many SurveyResponseSelectedOptions

SurveyResponseSelectedOption
  belongs to SurveyResponseAnswer
  belongs to AnswerOption
```

---

# MVP Business Rules

## Survey Availability

Users should only see surveys with status:

```txt
published
```

Admins may see:

```txt
draft
published
retired
```

---

## Survey Attempt Rules

For MVP:

* users can start a published survey
* users can resume an in-progress survey
* users can submit a completed survey
* admins can view each user’s survey status
* anonymous visitors can start and complete a published survey only through an
  enabled, unexpired anonymous survey link
* anonymous visitors may browse only links explicitly opted into the public
  anonymous survey directory; ordinary enabled anonymous links remain secret and
  unlisted
* anonymous attempts remain separate from registered user attempts and should be
  reported as anonymous, not as synthetic user accounts

Recommended MVP constraint:

```txt
one active attempt per user per survey
```

If repeat survey attempts are needed later, support can be added intentionally.

---

## Required Questions

If `is_required = true`, the participant must answer before moving forward.

Validation should happen:

* on the frontend for user experience
* on the backend for correctness

Never rely only on frontend validation.

---

## Conditional Navigation

Default behavior:

```txt
go to the next question by display_order
```

Conditional behavior:

```txt
if the selected answer option has a matching JUMP_TO_QUESTION rule,
go to target_question_id instead
```

If no rule matches, continue to the next question.

---

## Hidden Tag Resolution

When reporting survey results, hidden tags should be resolved through selected
answer options, question-level Other tags when `other_text` is non-null, and
value tags for supported entered-value questions.

Example path:

```txt
SurveyAttempt
-> SurveyResponseAnswer
-> SurveyResponseSelectedOption
-> AnswerOption
-> AnswerTag
```

Other path:

```txt
SurveyAttempt
-> SurveyResponseAnswer.other_text
-> SurveyQuestion
-> QuestionOtherTag
```

Survey participants should never receive hidden tag data in user-facing survey-taking API responses.

---

# Reporting Implications

The data model should support:

* listing all attempts for a survey
* listing all attempts for a user
* viewing completed responses
* viewing in-progress responses
* resolving hidden tags for selected answers
* displaying Other text separately from selected answer options
* exporting response data
* filtering by hidden tags later

---

# Questions To Confirm With Client

These are not blockers for MVP scaffolding, but they should be answered before finalizing later phases.

1. Can a user take the same survey more than once?

Recommended MVP answer:

```txt
No, one active/completed attempt per user per survey.
```

2. Should survey takers be able to edit completed surveys?

Recommended MVP answer:

```txt
No, completed surveys are locked unless an admin reopens them.
```

3. Do admins need to assign surveys to specific users, or are all published surveys available to all users?

Recommended MVP answer:

```txt
All published surveys are available to all users.
```

4. Do text and integer answers need hidden tags?

Recommended MVP answer:

```txt
Yes for admin reporting: value tags can apply to text/integer answers, while
choice questions use answer-option tags plus optional Other tags.
```

5. Should admins be able to reorder questions?

Recommended MVP answer:

```txt
Yes, using display_order.
```

6. Should branching logic be allowed to jump backward?

Recommended MVP answer:

```txt
No, only forward jumps in MVP to avoid loops.
```

7. Should unfinished surveys automatically become abandoned?

Recommended MVP answer:

```txt
Eventually yes, but for MVP this can be admin-visible as in_progress unless abandoned status is manually or scheduled later.
```

8. Should anonymous survey completion be supported?

Recommended MVP answer:

```txt
Yes, but only through admin-created, tokenized anonymous survey links scoped to
published surveys. Anonymous survey takers must remain separate from registered
users and must not need accounts.
```
