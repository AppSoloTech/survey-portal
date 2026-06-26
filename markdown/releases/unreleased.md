# Unreleased

Release title: Next Release

Summary: Adds Admin-only dictionary suggestions for glossary definitions while keeping manual glossary editing available.

## Added

- Admin glossary editors can request Merriam-Webster definition suggestions, apply a suggestion, edit it before saving, or keep a manual definition.
- Dictionary lookups run server-side behind environment configuration and keep provider keys out of browser code.

## Operational Notes

- Dictionary suggestions are disabled by default with `DICTIONARY_PROVIDER=disabled`.
- To enable Merriam-Webster suggestions, configure `DICTIONARY_PROVIDER=merriam-webster` and `MERRIAM_WEBSTER_COLLEGIATE_API_KEY` in the environment.
