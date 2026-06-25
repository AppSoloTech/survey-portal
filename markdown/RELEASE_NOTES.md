# Release Notes Workflow

Release notes are committed project memory and the source for the admin-only
Software updates page.

## Version Source Of Truth

The root `package.json` `version` field is the deployed app version. Workspace
package versions do not need to change for every app release unless their
package contract changes.

Use semantic versioning:

```txt
MAJOR.MINOR.PATCH
```

## File Location

Release files live in:

```txt
markdown/releases/
```

Each file is named:

```txt
vX.Y.Z.md
```

## File Format

Use this format:

```md
# vX.Y.Z - Short release title

Release date: YYYY-MM-DD

Summary: One short paragraph describing why this release exists.

## Added

- New user-visible capability.

## Changed

- Changed existing behavior.

## Fixed

- Fixed bug or regression.

## Security

- Security, privacy, or authorization change.

## Operational Notes

- Deployment, migration, validation, or support note.
```

Only include sections that have notes. Every included section must contain at
least one bullet.

## Creating Notes

Before a production-bound commit, update the root package version and scaffold
the note:

```bash
npm run release:notes
```

The command creates `markdown/releases/v<package.version>.md` and refuses to
overwrite an existing release file. Edit the generated bullets before commit.

## Validating Notes

Run:

```bash
npm run release:check
```

This verifies:

- the root app version is valid semver
- release filenames match their Markdown headings
- release dates are valid `YYYY-MM-DD`
- summaries are present
- every included section has bullet items
- the latest release note matches the root app version

`npm run deploy` also runs release validation against `origin/main` before it
pushes. The GitHub Actions production workflow runs the same validation for
direct pushes to `main`.

## Admin Publishing Model

Release notes are published by committing the Markdown file and deploying the
app. The admin page reads the committed release files at runtime; admins can
view but not edit release notes in the app.
