import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  formatBottleneck,
  formatDurationSeconds,
  formatLatencyMs,
  formatNumber,
  formatPercent,
  getHttpMetricHighlights,
  getMetricAvailability,
  getPerformanceConfigHighlights,
  getPerformanceStatusClass,
  getPerformanceStatusLabel,
  getSqlMetricHighlights
} from "./AdminPerformancePage.js";

const source = readFileSync(new URL("./AdminPerformancePage.tsx", import.meta.url), "utf8");

describe("AdminPerformancePage helpers", () => {
  it("covers every persisted run status", () => {
    expect(getPerformanceStatusLabel("running")).toBe("Running");
    expect(getPerformanceStatusLabel("completed")).toBe("Completed");
    expect(getPerformanceStatusLabel("failed")).toBe("Failed");
    expect(getPerformanceStatusLabel("aborted")).toBe("Aborted");
    expect(getPerformanceStatusClass("aborted")).toBe("performance-aborted");
  });

  it("formats missing and present performance summary fields", () => {
    expect(formatDurationSeconds(null)).toBe("Unavailable");
    expect(formatDurationSeconds(125)).toBe("2m 5s");
    expect(formatLatencyMs(null)).toBe("Unavailable");
    expect(formatLatencyMs(127.8)).toBe("128 ms");
    expect(formatPercent(null)).toBe("Unavailable");
    expect(formatPercent(0.0123)).toBe("1.23%");
    expect(formatNumber(null)).toBe("Unavailable");
    expect(formatNumber(12.3456)).toBe("12.35");
    expect(formatBottleneck("app_pool")).toBe("App Pool");
  });

  it("extracts operator configuration highlights without exposing local artifacts", () => {
    expect(
      getPerformanceConfigHighlights({
        appDbPoolMax: 10,
        appInstanceCount: 2,
        duration: "5m",
        persistenceSmoke: true,
        profile: "mixed",
        rampingStages: [
          { duration: "1m", target: 10 },
          { duration: "4m", target: 25 }
        ],
        sampleIntervalMs: 1000,
        vus: 25
      })
    ).toEqual([
      { label: "Profile", value: "mixed" },
      { label: "VUs", value: "25" },
      { label: "Duration", value: "5m" },
      { label: "Ramping stages", value: "1m to 10 VUs, 4m to 25 VUs" },
      { label: "App DB pool max", value: "10" },
      { label: "App instances", value: "2" },
      { label: "Sample interval", value: "1000 ms" },
      { label: "Mode", value: "Persistence smoke" }
    ]);

    expect(source).not.toContain("loadtest/reports/");
    expect(source).not.toContain("Run test");
    expect(source).not.toContain("Stop test");
    expect(source).not.toContain("Schedule test");
  });

  it("labels unavailable Azure and SQL metrics instead of implying zeros", () => {
    expect(
      getMetricAvailability({
        azure: { available: false, reason: "not configured" },
        sql: { available: false, unavailableReason: "pg_monitor missing" }
      })
    ).toEqual({
      azure: { available: false, label: "Unavailable: not configured" },
      sql: { available: false, label: "Unavailable: pg_monitor missing" }
    });

    expect(getSqlMetricHighlights({ sql: { available: false } })).toEqual([]);
  });

  it("summarizes available SQL and HTTP detail metrics", () => {
    expect(
      getSqlMetricHighlights({
        sql: {
          available: true,
          blockHitDelta: 240,
          blockReadDelta: 12,
          maxActiveConnections: 8,
          maxTotalConnections: 11,
          maxWaitingConnections: 1,
          sampleCount: 5,
          transactionCommitDelta: 80,
          transactionRollbackDelta: 2
        }
      })
    ).toEqual([
      { label: "SQL samples", value: "5" },
      { label: "Max active DB connections", value: "8" },
      { label: "Max total DB connections", value: "11" },
      { label: "Waiting DB connections", value: "1" },
      { label: "Transaction commits", value: "80" },
      { label: "Transaction rollbacks", value: "2" },
      { label: "Block reads", value: "12" },
      { label: "Block hits", value: "240" }
    ]);

    expect(
      getHttpMetricHighlights({
        http: {
          checksPassRate: 0.995,
          http5xxCount: 3
        }
      })
    ).toEqual([
      { label: "HTTP 5xx", value: "3" },
      { label: "Check pass rate", value: "99.50%" }
    ]);
  });
});
