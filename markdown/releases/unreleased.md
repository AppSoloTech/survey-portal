# Unreleased

Release title: Next Release

Summary: Admin review tagging now supports category-level living bindings without adding system rows to the tag catalog, tag category emoji defaults apply more predictably to new catalog values, the participant issue-profile thermometer has a richer ending animation, and the survey question header is simpler for participants.

## Changed

- Admins can apply all review tags in a tag category to a text answer from the Results tag dropdown; subscribed answers stay synced as category tags are added, moved, or removed through category deletion, with inherited-only chips managed through the category Stop control while manual tags are preserved.
- Builder hidden-tag add forms now show a virtual `<ALL>` tag value for the selected category, creating a living auto-apply subscription for option, Other answer, or text/integer value tag targets.
- New, edited, or deleted Admin Tags catalog values now sync through builder hidden-tag `<ALL>` subscriptions, keeping expanded hidden tags current for submitted and future responses while preserving manual hidden tags; migrations backfill older marker targets into subscriptions.
- Admin Results now keeps summary details collapsible and browses participant attempts through a paginated, table-like list with page-size controls and visible range context.
- The Admin attempts API now returns bounded pages by default, with pagination metadata and date-range-aware counts instead of returning every attempt at once.
- The participant issue-profile thermometer now uses a cleaner classic SVG shape with a continuous blue-to-red warming fill, intact and broken-rim states, liquid meniscus polish, and a top-centered GSAP cap break-off, shard, puff, spark, and emoji burst while preserving reduced-motion fallback behavior.
- Participant survey question pages now keep the assessment name and page name while removing the horizontal assessment progress bar and page-path location copy from the question header.

## Fixed

- New Admin Tags catalog values now inherit an existing tag category emoji when the category has one shared emoji and the new value does not specify its own emoji.
