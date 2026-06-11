import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";

import { provisionAdmin } from "../../../scripts/provision-admin.mjs";
import { pool } from "../src/db.js";
import { resolveTestDatabaseUrl } from "./helpers/testDatabaseUrl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

describe("admin provisioning", () => {
  it("creates an admin with a bcrypt hash and can be rerun without duplicates", async () => {
    const email = "provisioned.admin@example.com";
    const password = "test-password-123";

    const firstRun = await provisionAdmin({
      databaseUrl: resolveTestDatabaseUrl(),
      admin: {
        firstName: "Provisioned",
        lastName: "Admin",
        email,
        password
      },
      logger: silentLogger
    });
    const secondRun = await provisionAdmin({
      databaseUrl: resolveTestDatabaseUrl(),
      admin: {
        firstName: "Provisioned",
        lastName: "Admin",
        email,
        password
      },
      logger: silentLogger
    });

    expect(secondRun.id).toBe(firstRun.id);

    const result = await pool.query(
      `select email, password_hash, role, count(*) over () as row_count
       from users
       where email = $1`,
      [email]
    );

    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].row_count)).toBe(1);
    expect(result.rows[0].role).toBe("admin");
    expect(result.rows[0].password_hash).not.toBe(password);
    await expect(bcrypt.compare(password, result.rows[0].password_hash)).resolves.toBe(true);
  });

  it("promotes an existing user to admin", async () => {
    const email = "promote.me@example.com";
    const passwordHash = await bcrypt.hash("old-password-123", 12);

    await pool.query(
      `insert into users (first_name, last_name, email, password_hash, role)
       values ('Regular', 'User', $1, $2, 'user')`,
      [email, passwordHash]
    );

    await provisionAdmin({
      databaseUrl: resolveTestDatabaseUrl(),
      admin: {
        firstName: "Regular",
        lastName: "Admin",
        email,
        password: "new-password-123"
      },
      logger: silentLogger
    });

    const result = await pool.query(
      `select first_name, last_name, role
       from users
       where email = $1`,
      [email]
    );

    expect(result.rows[0]).toMatchObject({
      first_name: "Regular",
      last_name: "Admin",
      role: "admin"
    });
  });
});

describe("local seed guard", () => {
  it("refuses reset-and-seed execution when RUN_ENV is prod", () => {
    const result = spawnSync("node", ["scripts/reset-local-db.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        RUN_ENV: "prod",
        DATABASE_URL: resolveTestDatabaseUrl(),
        LOCAL_DATABASE_URL: resolveTestDatabaseUrl(),
        HOSTED_DATABASE_URL: resolveTestDatabaseUrl()
      },
      encoding: "utf8"
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RUN_ENV is prod");
  });
});

const silentLogger = {
  log: () => undefined
};
