import type { SoftwareReleaseNote } from "@survey-portal/shared";
import { useEffect, useState } from "react";

import { fetchSoftwareReleaseNotes } from "../../api/admin.js";

export function AdminReleasesPage() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [releases, setReleases] = useState<SoftwareReleaseNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    fetchSoftwareReleaseNotes()
      .then((response) => {
        if (isActive) {
          setCurrentVersion(response.currentVersion);
          setReleases(response.releases);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load releases");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Software updates</h2>
        <p>
          Review the deployed app version and production patch notes published from the
          project release workflow.
        </p>
      </div>

      {error ? <p className="status error">{error}</p> : null}
      {isLoading ? <p className="status muted">Loading release notes...</p> : null}

      {!isLoading && !error ? (
        <div className="release-notes-layout">
          <aside className="release-version-panel">
            <p className="eyebrow">Current version</p>
            <strong>{currentVersion ? `v${currentVersion}` : "Unavailable"}</strong>
            <span>Release notes are read from committed Markdown files.</span>
          </aside>

          <div className="release-timeline" aria-label="Software release history">
            {releases.length === 0 ? (
              <p className="status muted">No release notes have been published yet.</p>
            ) : null}
            {releases.map((release) => (
              <ReleaseCard key={release.version} release={release} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReleaseCard({ release }: { release: SoftwareReleaseNote }) {
  return (
    <article className="release-note-card">
      <div className="release-note-heading">
        <div>
          <p className="eyebrow">v{release.version}</p>
          <h3>{release.title}</h3>
        </div>
        <time dateTime={release.releasedAt}>{formatDate(release.releasedAt)}</time>
      </div>
      <p>{release.summary}</p>

      <div className="release-note-sections">
        {release.sections.map((section) => (
          <section className="release-note-section" key={section.heading}>
            <h4>{section.heading}</h4>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}
