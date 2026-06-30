# Unreleased

Release title: Next Release

Summary: Replace this with a short summary before running `npm run release:prepare`.

## Changed

- Added an Admin-only Glossary question-search API foundation for finding
  matching question text across draft and published assessments, excluding
  retired or soft-deleted assessments.
- Added Glossary tabs in Admin so existing entry management stays separate
  from dynamic assessment question search.
- Added a Glossary search-to-entry workflow so Admins can start a reviewed
  Glossary entry from a matching question-search result without automatically
  creating entries or saving source-question references.
