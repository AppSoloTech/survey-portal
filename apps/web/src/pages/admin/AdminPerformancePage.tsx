import type {
  PerformanceTestRunDetail,
  PerformanceTestRunStatus,
  PerformanceTestRunSummary
} from "@survey-portal/shared";
import { useEffect, useState } from "react";

import {
  fetchPerformanceTestRunDetail,
  fetchPerformanceTestRuns
} from "../../api/admin.js";

const performanceRunsPerPage = 20;
const unavailableLabel = "Unavailable";

interface PerformanceRunListState {
  runs: PerformanceTestRunSummary[];
  total: number;
  page: number;
}

export interface ConfigHighlight {
  label: string;
  value: string;
}

export interface MetricAvailability {
  azure: {
    available: boolean;
    label: string;
  };
  sql: {
    available: boolean;
    label: string;
  };
}

type JsonRecord = Record<string, unknown>;

export function AdminPerformancePage() {
  const [listState, setListState] = useState<PerformanceRunListState>({
    runs: [],
    total: 0,
    page: 1
  });
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PerformanceTestRunDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    setIsLoadingList(true);
    setListError(null);

    fetchPerformanceTestRuns({ page: listState.page, pageSize: performanceRunsPerPage })
      .then((response) => {
        if (!isActive) {
          return;
        }

        setListState({
          runs: response.runs,
          total: response.total,
          page: response.page
        });

        setSelectedRunId((currentRunId) => {
          if (currentRunId && response.runs.some((run) => run.id === currentRunId)) {
            return currentRunId;
          }

          return response.runs[0]?.id ?? null;
        });
      })
      .catch((loadError) => {
        if (isActive) {
          setListError(loadError instanceof Error ? loadError.message : "Could not load runs");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingList(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [listState.page]);

  useEffect(() => {
    let isActive = true;

    if (!selectedRunId) {
      setDetail(null);
      setDetailError(null);
      setIsLoadingDetail(false);
      return () => {
        isActive = false;
      };
    }

    setIsLoadingDetail(true);
    setDetail(null);
    setDetailError(null);

    fetchPerformanceTestRunDetail(selectedRunId)
      .then((response) => {
        if (isActive) {
          setDetail(response.run);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setDetailError(
            loadError instanceof Error ? loadError.message : "Could not load run detail"
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedRunId]);

  const pageCount = Math.max(1, Math.ceil(listState.total / performanceRunsPerPage));

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Performance reports</h2>
        <p>
          Review CLI-generated load-test summaries, capacity signals, and persisted
          recommendations from approved operator runs.
        </p>
      </div>

      {listError ? <p className="status error">{listError}</p> : null}

      <div className="performance-report-layout">
        <section className="performance-run-list" aria-labelledby="performance-run-list-title">
          <div className="admin-user-class-header">
            <div>
              <h3 id="performance-run-list-title">Recent runs</h3>
              <p>Database-persisted summaries only; local CLI artifacts stay outside the app.</p>
            </div>
            <span className="admin-user-class-count standard">
              {listState.total} {listState.total === 1 ? "run" : "runs"}
            </span>
          </div>

          {isLoadingList ? <p className="status muted">Loading performance runs...</p> : null}

          {!isLoadingList && listState.runs.length === 0 ? (
            <div className="builder-empty-state" role="status" aria-live="polite">
              <strong>No performance runs yet</strong>
              <span>No CLI performance reports have been persisted yet.</span>
            </div>
          ) : null}

          {listState.runs.length > 0 ? (
            <>
              <div className="admin-users-table-wrap performance-table-wrap">
                <table className="admin-users-table performance-runs-table">
                  <thead>
                    <tr>
                      <th scope="col">Scenario</th>
                      <th scope="col">Status</th>
                      <th scope="col">Target</th>
                      <th scope="col">Started</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Max VUs</th>
                      <th scope="col">Peak RPS</th>
                      <th scope="col">p95 / p99</th>
                      <th scope="col">Error rate</th>
                      <th scope="col">Bottleneck</th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listState.runs.map((run) => (
                      <tr
                        className={selectedRunId === run.id ? "selected" : undefined}
                        key={run.id}
                      >
                        <td data-label="Scenario">
                          <strong>{run.scenario}</strong>
                          <span className="performance-run-key">{run.runKey}</span>
                        </td>
                        <td data-label="Status">
                          <span className={`status-pill ${getPerformanceStatusClass(run.status)}`}>
                            {getPerformanceStatusLabel(run.status)}
                          </span>
                        </td>
                        <td data-label="Target">{run.targetBaseUrl}</td>
                        <td data-label="Started">{formatDateTime(run.startedAt)}</td>
                        <td data-label="Duration">{formatDurationSeconds(run.durationSeconds)}</td>
                        <td data-label="Max VUs">{formatNumber(run.maxVus)}</td>
                        <td data-label="Peak RPS">{formatNumber(run.peakRequestsPerSecond)}</td>
                        <td data-label="p95 / p99">
                          {formatLatencyMs(run.p95Ms)} / {formatLatencyMs(run.p99Ms)}
                        </td>
                        <td data-label="Error rate">{formatPercent(run.errorRate)}</td>
                        <td data-label="Bottleneck">{formatBottleneck(run.bottleneck)}</td>
                        <td data-label="Actions">
                          <button
                            className="button-link compact-button secondary-button"
                            onClick={() => setSelectedRunId(run.id)}
                            type="button"
                          >
                            View report
                            <span className="visually-hidden">: {run.runKey}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pageCount > 1 ? (
                <div className="pagination-row" aria-label="Performance run pages">
                  <button
                    className="button-link compact-button secondary-button"
                    disabled={listState.page <= 1}
                    onClick={() =>
                      setListState((current) => ({ ...current, page: current.page - 1 }))
                    }
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="pagination-status">
                    Page {listState.page} of {pageCount}
                  </span>
                  <button
                    className="button-link compact-button secondary-button"
                    disabled={listState.page >= pageCount}
                    onClick={() =>
                      setListState((current) => ({ ...current, page: current.page + 1 }))
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <PerformanceRunDetailPanel
          detail={detail}
          error={detailError}
          isLoading={isLoadingDetail}
          selectedRunId={selectedRunId}
        />
      </div>
    </section>
  );
}

function PerformanceRunDetailPanel({
  detail,
  error,
  isLoading,
  selectedRunId
}: {
  detail: PerformanceTestRunDetail | null;
  error: string | null;
  isLoading: boolean;
  selectedRunId: number | null;
}) {
  if (!selectedRunId) {
    return (
      <aside className="profile-panel performance-detail-panel">
        <div className="builder-empty-state compact">
          <strong>Select a run</strong>
          <span>Choose a persisted performance run to inspect its report.</span>
        </div>
      </aside>
    );
  }

  if (isLoading) {
    return (
      <aside className="profile-panel performance-detail-panel">
        <p className="status muted">Loading run detail...</p>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="profile-panel performance-detail-panel">
        <p className="status error">{error}</p>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="profile-panel performance-detail-panel">
        <p className="status muted">No run selected.</p>
      </aside>
    );
  }

  const configHighlights = getPerformanceConfigHighlights(detail.config);
  const availability = getMetricAvailability(detail.summary);
  const sqlHighlights = getSqlMetricHighlights(detail.summary);
  const httpHighlights = getHttpMetricHighlights(detail.summary);

  return (
    <aside className="profile-panel performance-detail-panel" aria-label="Performance run detail">
      <div className="performance-detail-heading">
        <div>
          <p className="eyebrow">{detail.scenario}</p>
          <h3>{detail.runKey}</h3>
          <p>{detail.targetBaseUrl}</p>
        </div>
        <span className={`status-pill ${getPerformanceStatusClass(detail.status)}`}>
          {getPerformanceStatusLabel(detail.status)}
        </span>
      </div>

      <dl className="results-summary-grid performance-metric-grid" aria-label="Run metrics">
        <MetricCard label="Total requests" value={formatNumber(detail.totalRequests)} />
        <MetricCard label="Failed requests" value={formatNumber(detail.failedRequests)} />
        <MetricCard label="Error rate" value={formatPercent(detail.errorRate)} />
        <MetricCard label="p95 latency" value={formatLatencyMs(detail.p95Ms)} />
        <MetricCard label="p99 latency" value={formatLatencyMs(detail.p99Ms)} />
        <MetricCard label="Peak RPS" value={formatNumber(detail.peakRequestsPerSecond)} />
        <MetricCard label="Max VUs" value={formatNumber(detail.maxVus)} />
        <MetricCard label="Duration" value={formatDurationSeconds(detail.durationSeconds)} />
      </dl>

      <section className="performance-detail-section">
        <h4>Recommendation</h4>
        <p>{detail.recommendation ?? "No recommendation was stored for this run."}</p>
        <dl className="performance-compact-list">
          <div>
            <dt>Bottleneck</dt>
            <dd>{formatBottleneck(detail.bottleneck)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDateTime(detail.startedAt)}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{detail.finishedAt ? formatDateTime(detail.finishedAt) : unavailableLabel}</dd>
          </div>
        </dl>
      </section>

      <section className="performance-detail-section">
        <h4>Configuration</h4>
        {configHighlights.length > 0 ? (
          <dl className="performance-compact-list">
            {configHighlights.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="status muted">No configuration highlights were stored.</p>
        )}
      </section>

      <section className="performance-detail-section">
        <h4>Metric availability</h4>
        <dl className="performance-compact-list">
          <div>
            <dt>Azure metrics</dt>
            <dd>{availability.azure.label}</dd>
          </div>
          <div>
            <dt>SQL metrics</dt>
            <dd>{availability.sql.label}</dd>
          </div>
          {httpHighlights.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
          {sqlHighlights.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="performance-detail-section">
        <h4>Operator caveats</h4>
        <ul className="performance-caveat-list">
          <li>DB pool max and app instance count affect bottleneck classification.</li>
          <li>
            Active connection stats can undercount without `pg_monitor`,
            `pg_read_all_stats`, or the app DB role.
          </li>
          <li>Recommendations are capacity signals, not automatic upgrade commands.</li>
        </ul>
      </section>

      <section className="performance-detail-section">
        <h4>Stored markdown report</h4>
        {detail.reportMarkdown ? (
          <pre className="performance-report-markdown">{detail.reportMarkdown}</pre>
        ) : (
          <p className="status muted">No markdown report was stored.</p>
        )}
      </section>
    </aside>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function getPerformanceStatusLabel(status: PerformanceTestRunStatus): string {
  const labels: Record<PerformanceTestRunStatus, string> = {
    aborted: "Aborted",
    completed: "Completed",
    failed: "Failed",
    running: "Running"
  };

  return labels[status];
}

export function getPerformanceStatusClass(status: PerformanceTestRunStatus): string {
  return `performance-${status}`;
}

export function formatDurationSeconds(value: number | null): string {
  if (value === null) {
    return unavailableLabel;
  }

  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function formatLatencyMs(value: number | null): string {
  return value === null ? unavailableLabel : `${Math.round(value)} ms`;
}

export function formatPercent(value: number | null): string {
  return value === null ? unavailableLabel : `${(value * 100).toFixed(2)}%`;
}

export function formatDateTime(value: string): string {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? unavailableLabel : parsed.toLocaleString();
}

export function formatNumber(value: number | null): string {
  if (value === null) {
    return unavailableLabel;
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatBottleneck(value: string | null): string {
  if (!value) {
    return unavailableLabel;
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getPerformanceConfigHighlights(config: JsonRecord): ConfigHighlight[] {
  const highlights: ConfigHighlight[] = [];

  addHighlight(highlights, "Profile", readString(config, "profile"));
  addHighlight(highlights, "VUs", readNumber(config, "vus"));
  addHighlight(highlights, "Duration", readString(config, "duration"));
  addHighlight(highlights, "Ramping stages", formatRampingStages(config.rampingStages));
  addHighlight(highlights, "App DB pool max", readNumber(config, "appDbPoolMax"));
  addHighlight(highlights, "App instances", readNumber(config, "appInstanceCount"));
  addHighlight(highlights, "Sample interval", formatMilliseconds(readNumber(config, "sampleIntervalMs")));

  if (readBoolean(config, "persistenceSmoke")) {
    addHighlight(highlights, "Mode", "Persistence smoke");
  }

  return highlights;
}

export function getMetricAvailability(summary: JsonRecord): MetricAvailability {
  const azure = readRecord(summary, "azure");
  const sql = readRecord(summary, "sql");
  const azureAvailable = readBoolean(azure, "available") === true;
  const sqlAvailable = readBoolean(sql, "available") === true;

  return {
    azure: {
      available: azureAvailable,
      label: azureAvailable
        ? "Available"
        : `Unavailable${formatReason(readString(azure, "reason"))}`
    },
    sql: {
      available: sqlAvailable,
      label: sqlAvailable
        ? "Available"
        : `Unavailable${formatReason(readString(sql, "unavailableReason"))}`
    }
  };
}

export function getSqlMetricHighlights(summary: JsonRecord): ConfigHighlight[] {
  const sql = readRecord(summary, "sql");

  if (readBoolean(sql, "available") !== true) {
    return [];
  }

  const highlights: ConfigHighlight[] = [];

  addHighlight(highlights, "SQL samples", readNumber(sql, "sampleCount"));
  addHighlight(highlights, "Max active DB connections", readNumber(sql, "maxActiveConnections"));
  addHighlight(highlights, "Max total DB connections", readNumber(sql, "maxTotalConnections"));
  addHighlight(highlights, "Waiting DB connections", readNumber(sql, "maxWaitingConnections"));
  addHighlight(highlights, "Transaction commits", readNumber(sql, "transactionCommitDelta"));
  addHighlight(highlights, "Transaction rollbacks", readNumber(sql, "transactionRollbackDelta"));
  addHighlight(highlights, "Block reads", readNumber(sql, "blockReadDelta"));
  addHighlight(highlights, "Block hits", readNumber(sql, "blockHitDelta"));

  return highlights;
}

export function getHttpMetricHighlights(summary: JsonRecord): ConfigHighlight[] {
  const http = readRecord(summary, "http");
  const highlights: ConfigHighlight[] = [];

  addHighlight(highlights, "HTTP 5xx", readNumber(http, "http5xxCount"));
  addHighlight(highlights, "Check pass rate", formatOptionalPercent(readNumber(http, "checksPassRate")));

  return highlights;
}

function addHighlight(
  highlights: ConfigHighlight[],
  label: string,
  value: number | string | null
): void {
  if (value === null || value === "") {
    return;
  }

  highlights.push({ label, value: typeof value === "number" ? formatNumber(value) : value });
}

function formatOptionalPercent(value: number | null): string | null {
  return value === null ? null : formatPercent(value);
}

function formatMilliseconds(value: number | null): string | null {
  return value === null ? null : `${value} ms`;
}

function formatReason(reason: string | null): string {
  return reason ? `: ${reason}` : "";
}

function formatRampingStages(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return value
    .map((stage) => {
      if (!isRecord(stage)) {
        return null;
      }

      const duration = readString(stage, "duration");
      const target = readNumber(stage, "target");

      return duration && target !== null ? `${duration} to ${target} VUs` : null;
    })
    .filter((stage): stage is string => Boolean(stage))
    .join(", ");
}

function readRecord(source: JsonRecord, key: string): JsonRecord {
  const value = source[key];

  return isRecord(value) ? value : {};
}

function readString(source: JsonRecord, key: string): string | null {
  const value = source[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(source: JsonRecord, key: string): number | null {
  const value = source[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return null;
}

function readBoolean(source: JsonRecord, key: string): boolean | null {
  const value = source[key];

  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
