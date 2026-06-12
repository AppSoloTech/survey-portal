-- Re-run the catalog backfill from 0008. Environments that applied 0008 on an
-- empty database and seeded afterwards (the local/dev flow) have answer tags
-- that never reached tag_definitions, because seed SQL bypasses the API's
-- registerTagDefinition(). Idempotent via the unique (tag_key, tag_value)
-- constraint.
insert into tag_definitions (tag_key, tag_value)
select distinct tag_key, tag_value
from answer_tags
on conflict (tag_key, tag_value) do nothing;
