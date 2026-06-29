import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { defaultEnvPath, resolveLoadtestConfig } from "./lib/env.mjs";

function main() {
  let ok = true;

  console.log("Load-test doctor");

  if (!existsSync(defaultEnvPath)) {
    ok = false;
    console.log("FAIL .env.loadtest not found. Copy .env.loadtest.example to .env.loadtest.");
  } else {
    console.log("OK .env.loadtest found");

    try {
      const config = resolveLoadtestConfig({ argv: process.argv.slice(2) });
      console.log(`OK target config parsed (${config.devMode ? "dev/local" : "hosted"})`);
      console.log(`  HTTP target: ${config.baseUrl}`);
      console.log(`  DB target: ${config.targetLabel}`);
    } catch (error) {
      ok = false;
      console.log(`FAIL target config failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const k6 = spawnSync("k6", ["version"], { encoding: "utf8" });

  if (k6.status === 0) {
    console.log(`OK ${k6.stdout.trim() || "k6 is installed"}`);
  } else {
    ok = false;
    console.log("FAIL k6 not found on PATH. Install k6 before running HTTP load profiles.");
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
