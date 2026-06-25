// One-time job: bucket every tag definition into a tag group named after its
// tag_key (the bold prefix shown in the admin catalog, e.g. "Equity" or
// "Federal Civil Rights").
//
// For each distinct tag_key it ensures a tag_group with that name exists, then
// assigns group_id to the tags that carry that key. Display order is rebuilt so
// groups appear alphabetically by name and tags appear alphabetically by value
// within each group.
//
// Safety mirrors scripts/migrate-hosted.mjs: connection settings come only from
// .env.prod at the repository root, localhost is refused, and nothing is written
// unless --yes is passed (otherwise it is a read-only dry run).
//
// Usage:
//   node scripts/group-tags-by-key.mjs          dry run, prints the plan
//   node scripts/group-tags-by-key.mjs --yes     apply the grouping
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envProdPath = path.join(rootDir, ".env.prod");
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseEnvFile(filePath) {
  const values = {};

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return values;
}

function resolveHostedConfig() {
  if (!existsSync(envProdPath)) {
    fail(
      ".env.prod not found at the repository root.\n" +
        "Copy .env.prod.example to .env.prod and fill in the hosted database settings."
    );
  }

  const env = parseEnvFile(envProdPath);
  let url = env.HOSTED_DATABASE_URL;

  if (!url) {
    const missing = ["DB_HOST", "DB_NAME", "DB_USER"].filter((key) => !env[key]);

    if (missing.length > 0) {
      fail(`.env.prod must set HOSTED_DATABASE_URL or DB_* parts (missing: ${missing.join(", ")}).`);
    }

    const port = env.DB_PORT ?? "5432";
    url = `postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD ?? "")}@${env.DB_HOST}:${port}/${env.DB_NAME}`;
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    fail(".env.prod database settings do not form a valid postgresql:// URL.");
  }

  if (localHosts.has(parsed.hostname)) {
    fail(
      `Refusing to run against local host ${parsed.hostname}. This job targets the hosted database only.`
    );
  }

  const ca = env.DATABASE_SSL_CA_PATH
    ? readFileSync(path.resolve(rootDir, env.DATABASE_SSL_CA_PATH), "utf8")
    : undefined;

  return {
    url,
    label: `${parsed.username}@${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
  };
}

// Build the desired grouping from the current tag definitions: one group per
// distinct tag_key, groups sorted by name, tags sorted by value within a group.
function buildPlan(tags) {
  const byKey = new Map();

  for (const tag of tags) {
    if (!byKey.has(tag.tag_key)) {
      byKey.set(tag.tag_key, []);
    }
    byKey.get(tag.tag_key).push(tag);
  }

  const groupNames = [...byKey.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return groupNames.map((name) => ({
    name,
    tags: byKey
      .get(name)
      .slice()
      .sort((a, b) => a.tag_value.localeCompare(b.tag_value, undefined, { sensitivity: "base" }))
  }));
}

async function main() {
  const apply = process.argv.includes("--yes");
  const config = resolveHostedConfig();

  console.log(`Hosted database: ${config.label}`);
  console.log(apply ? "Mode: APPLY (--yes given)\n" : "Mode: dry run (pass --yes to apply)\n");

  const pool = new Pool({ connectionString: config.url, ssl: config.ssl });

  try {
    const { rows: tags } = await pool.query(
      `select id, tag_key, tag_value, group_id
       from tag_definitions
       order by tag_key, tag_value, id`
    );

    if (tags.length === 0) {
      console.log("No tag definitions found; nothing to do.");
      return;
    }

    const plan = buildPlan(tags);
    console.log(`${tags.length} tags across ${plan.length} groups:`);

    for (const [index, group] of plan.entries()) {
      console.log(`  ${index + 1}. ${group.name} (${group.tags.length} tags)`);
      for (const tag of group.tags) {
        console.log(`       - ${tag.tag_value}`);
      }
    }

    if (!apply) {
      console.log("\nDry run complete; no changes made.");
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("begin");

      // Lock against the highest existing group order so we never collide with
      // groups an admin may already have created by hand.
      let nextGroupOrder =
        (
          await client.query(
            `select coalesce(max(display_order), 0) as max from tag_groups`
          )
        ).rows[0].max + 1;

      for (const group of plan) {
        // Reuse a group of the same name if one already exists; otherwise create
        // it at the end of the current ordering.
        const existing = await client.query(
          `select id from tag_groups where name = $1`,
          [group.name]
        );

        let groupId;

        if (existing.rowCount > 0) {
          groupId = existing.rows[0].id;
        } else {
          const inserted = await client.query(
            `insert into tag_groups (name, display_order)
             values ($1, $2)
             returning id`,
            [group.name, nextGroupOrder]
          );
          groupId = inserted.rows[0].id;
          nextGroupOrder += 1;
        }

        // Assign each tag to the group with a fresh per-group display order.
        for (const [index, tag] of group.tags.entries()) {
          await client.query(
            `update tag_definitions
             set group_id = $2,
                 display_order = $3,
                 updated_at = now()
             where id = $1`,
            [tag.id, groupId, index + 1]
          );
        }
      }

      await client.query("commit");
      console.log(`\nDone. Created/used ${plan.length} groups and assigned ${tags.length} tags.`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`group-tags-by-key failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
