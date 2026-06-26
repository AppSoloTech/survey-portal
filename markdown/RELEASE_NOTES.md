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

The working draft for the next release lives in:

```txt
markdown/releases/unreleased.md
```

Agents should update `unreleased.md` during production-bound implementation
sessions. The admin app ignores this draft; only versioned `vX.Y.Z.md` files
are shown on `/admin/releases`.

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

## Drafting Notes During Implementation

Start or ensure the draft note exists:

```bash
npm run release:draft
```

During each coding session that changes production behavior, update
`markdown/releases/unreleased.md` with concise admin-readable bullets. Keep
developer-only review notes, raw commit messages, and temporary implementation
details in phase notes instead.

Only user-facing or deployment-relevant changes belong in `unreleased.md`.
Keep implementation handoffs, review findings, and temporary investigation
notes in `notes/` or the phase log.

## Creating Notes

For one-off manual release files, update the root package version and scaffold
the note:

```bash
npm run release:notes
```

The command creates `markdown/releases/v<package.version>.md` and refuses to
overwrite an existing release file. Edit the generated bullets before commit.

For the normal automated release path, promote the draft note:

```bash
npm run release:prepare
```

To preview the exact versioned Markdown that would be generated without
writing files, run:

```bash
npm run release:preview
```

For local dev release prep, run the convenience command:

```bash
npm run release:dev
```

This promotes the draft to the next patch version, updates the root package
version and lockfile, resets the draft, validates release notes, and runs the
release-note unit tests.

By default this prepares the next patch version. To choose a specific bump or
version:

```bash
npm run release:prepare -- --version minor
npm run release:prepare -- --version 1.2.3
```

The prepare command:

- reads `markdown/releases/unreleased.md`
- rejects placeholder release title, summary, or bullet text
- bumps the root `package.json` app version and root lockfile version
- creates `markdown/releases/vX.Y.Z.md`
- resets `markdown/releases/unreleased.md` for the next cycle
- runs release-note validation against the promoted output
- refuses to overwrite an existing versioned release file

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
pushes. It prints a deploy preflight summary with the current version, latest
release-note file, commit count, and migration-file summary before pushing. The
GitHub Actions production workflow runs the same validation for direct pushes
to `main`.

## Admin Publishing Model

Release notes are published by committing the Markdown file and deploying the
app. The admin page reads the committed release files at runtime; admins can
view but not edit release notes in the app.
