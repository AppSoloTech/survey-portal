import { pathToFileURL } from "node:url";

export { createPerformanceRun, finishPerformanceRun } from "./lib/persistence.mjs";
export { buildMarkdownReport, classifyBottleneck, normalizeK6Summary } from "./lib/reporting.mjs";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    "loadtest/persist-results.mjs exports persistence helpers. Use npm run loadtest:run or npm run loadtest:db to persist report rows."
  );
}
