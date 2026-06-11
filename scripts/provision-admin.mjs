import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import bcrypt from "bcrypt";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const maxPasswordBytes = 72;

export async function provisionAdmin({
  databaseUrl,
  admin,
  ssl,
  logger = console
}) {
  const validation = validateAdmin(admin);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const passwordHash = await bcrypt.hash(validation.value.password, 12);
  const pool = new Pool({ connectionString: databaseUrl, ...(ssl ? { ssl } : {}) });

  try {
    const result = await pool.query(
      `insert into users (first_name, last_name, email, password_hash, role)
       values ($1, $2, $3, $4, 'admin')
       on conflict (email) do update
       set
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         password_hash = excluded.password_hash,
         role = 'admin',
         updated_at = now()
       returning id, email, role`,
      [
        validation.value.firstName,
        validation.value.lastName,
        validation.value.email,
        passwordHash
      ]
    );

    const user = result.rows[0];
    logger.log(`Provisioned admin ${user.email} (id ${user.id}).`);
    return user;
  } finally {
    await pool.end();
  }
}

function validateAdmin(admin) {
  const firstName = cleanText(admin.firstName);
  const lastName = cleanText(admin.lastName);
  const email = cleanText(admin.email).toLowerCase();
  const password = typeof admin.password === "string" ? admin.password : "";

  if (!firstName || !lastName || !email || !password) {
    return { ok: false, error: "Admin first name, last name, email, and password are required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Admin email must be a valid email address." };
  }

  if (password.length < 8) {
    return { ok: false, error: "Admin password must be at least 8 characters." };
  }

  if (Buffer.byteLength(password, "utf8") > maxPasswordBytes) {
    return { ok: false, error: "Admin password must be at most 72 bytes." };
  }

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      password
    }
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadDotenv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
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
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveDatabaseUrl() {
  const runEnv = process.env.RUN_ENV ?? "dev";

  if (runEnv !== "dev" && runEnv !== "prod") {
    throw new Error("RUN_ENV must be either dev or prod");
  }

  // Both environments accept a connection string or discrete DB_* settings;
  // hosted platforms often configure the parts individually.
  const url =
    runEnv === "prod"
      ? process.env.HOSTED_DATABASE_URL ?? process.env.DATABASE_URL
      : process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;

  if (url) {
    return url;
  }

  const host = readRequiredEnv("DB_HOST");
  const port = process.env.DB_PORT ?? "5432";
  const name = readRequiredEnv("DB_NAME");
  const user = readRequiredEnv("DB_USER");
  const password = process.env.DB_PASSWORD ?? "";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

function readOptionalDatabaseSslCa() {
  const inlineCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");

  if (inlineCa) {
    return inlineCa;
  }

  const caPath = process.env.DATABASE_SSL_CA_PATH;

  if (!caPath) {
    return undefined;
  }

  return readFileSync(caPath, "utf8");
}

function resolveDatabaseSsl() {
  if ((process.env.RUN_ENV ?? "dev") !== "prod") {
    return undefined;
  }

  const ca = readOptionalDatabaseSslCa();

  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {})
  };
}

function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function readAdminFromEnvironmentOrPrompt() {
  const envAdmin = {
    firstName: process.env.ADMIN_FIRST_NAME,
    lastName: process.env.ADMIN_LAST_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  };

  if (envAdmin.firstName && envAdmin.lastName && envAdmin.email && envAdmin.password) {
    return envAdmin;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "Set ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD when running non-interactively."
    );
  }

  const rl = readline.createInterface({ input, output });

  try {
    const firstName = envAdmin.firstName ?? (await rl.question("Admin first name: "));
    const lastName = envAdmin.lastName ?? (await rl.question("Admin last name: "));
    const email = envAdmin.email ?? (await rl.question("Admin email: "));
    const password = envAdmin.password ?? (await promptHidden("Admin password: "));

    return { firstName, lastName, email, password };
  } finally {
    rl.close();
  }
}

async function promptHidden(prompt) {
  output.write(prompt);

  return new Promise((resolve) => {
    const chunks = [];
    const wasRaw = input.isRaw;

    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    const onData = (char) => {
      if (char === "\r" || char === "\n") {
        input.setRawMode(wasRaw);
        input.off("data", onData);
        output.write("\n");
        resolve(chunks.join(""));
        return;
      }

      if (char === "\u0003") {
        input.setRawMode(wasRaw);
        process.exit(130);
      }

      if (char === "\u007f") {
        chunks.pop();
        return;
      }

      chunks.push(char);
    };

    input.on("data", onData);
  });
}

async function main() {
  loadDotenv(path.join(rootDir, ".env"));

  const admin = await readAdminFromEnvironmentOrPrompt();
  await provisionAdmin({ databaseUrl: resolveDatabaseUrl(), admin, ssl: resolveDatabaseSsl() });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `admin:provision failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
