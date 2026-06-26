# Unreleased

Release title: Published Survey Tag Maintenance

Summary: Allows admins to correct hidden tag metadata on live surveys without unlocking survey structure or changing participant answers.

## Added

- Admins can add, edit, and remove hidden tags on published surveys while questions, options, pages, and rules remain locked.
- Text and integer value tags can now be edited directly instead of requiring delete and recreate.

## Changed

- Reports, attempt detail, and CSV exports reflect current hidden tag metadata for already answered published surveys.

## Security

- Hidden tags remain admin-only and are still excluded from participant survey payloads.
