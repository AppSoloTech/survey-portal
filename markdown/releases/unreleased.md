# Unreleased

Release title: Next Release

Summary: Admin review tagging now supports category-level living bindings without adding system rows to the tag catalog.

## Changed

- Admins can apply all review tags in a tag category to a text answer from the Results tag dropdown; subscribed answers stay synced as category tags are added, moved, or removed through category deletion, with inherited-only chips managed through the category Stop control while manual tags are preserved.
- Builder hidden-tag add forms now show a virtual `<ALL>` tag value for the selected category, creating a living auto-apply subscription for option, Other answer, or text/integer value tag targets.
- New, edited, or deleted Admin Tags catalog values now sync through builder hidden-tag `<ALL>` subscriptions, keeping expanded hidden tags current for submitted and future responses while preserving manual hidden tags; migrations backfill older marker targets into subscriptions.
