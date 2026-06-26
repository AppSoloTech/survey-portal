# Unreleased

Release title: Next Release

Summary: Replace this with a short summary before running `npm run release:prepare`.

## Changed

- Added an admin page-template library so survey pages can be saved and reused in other draft surveys, copying questions, options, scale ranges, answer hidden tags, value hidden tags, and Other hidden tags while conditional rules are recorded as warnings instead of copied.
- Added placement and naming controls for inserted templates, including separate template names, inserted page titles, and the ability to insert a saved page at the beginning, after an existing page, or at the end of a draft survey.
- Expanded the template library with admin question templates that copy question text, type, required/help settings, options, scale ranges, answer hidden tags, value hidden tags, and Other hidden tags while preserving fresh inserted IDs and excluding conditional rules.
- Added combined admin template library management in a dedicated Templates tab with page/question kind labels, search/filter, source metadata, rename, delete, and detail APIs.
- Added draft-only question-template insertion into selected pages with beginning, after-question, and end placement controls.
