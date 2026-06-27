import type { AnonymousSurveyDirectoryItem } from "@survey-portal/shared";
import { useEffect, useState } from "react";

import { fetchAnonymousSurveyDirectory } from "../api/surveys.js";
import { AlertMessage } from "../components/AlertMessage.js";
import { useReveal } from "../motion/motion.js";

export function AnonymousSurveyDirectoryPage() {
  const revealRef = useReveal<HTMLElement>();
  const [surveys, setSurveys] = useState<AnonymousSurveyDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    setIsLoading(true);
    setError(null);

    fetchAnonymousSurveyDirectory()
      .then((response) => {
        if (isActive) {
          setSurveys(response.surveys);
        }
      })
      .catch((directoryError) => {
        if (isActive) {
          setError(
            directoryError instanceof Error
              ? directoryError.message
              : "Could not load anonymous surveys"
          );
          setSurveys([]);
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
    <section className="page anonymous-directory-page" ref={revealRef}>
      <div className="page-header anonymous-directory-header" data-reveal>
        <p className="eyebrow">Anonymous surveys</p>
        <h1>Public survey directory</h1>
        <p>Open surveys that can be completed without signing in.</p>
      </div>

      {error ? <AlertMessage variant="error">{error}</AlertMessage> : null}
      {isLoading ? <AlertMessage variant="info">Loading surveys...</AlertMessage> : null}

      {!isLoading && !error && surveys.length === 0 ? (
        <div className="builder-empty-state" data-reveal>
          <strong>No public anonymous surveys</strong>
          <span>Check back later for open survey links.</span>
        </div>
      ) : null}

      {surveys.length > 0 ? (
        <div className="anonymous-directory-list">
          {surveys.map((survey) => (
            <article className="anonymous-directory-card" data-reveal key={survey.publicUrl}>
              <div className="anonymous-directory-card-main">
                <div className="anonymous-directory-meta">
                  {survey.categoryName ? (
                    <span className="status-pill published">{survey.categoryName}</span>
                  ) : null}
                  <span className="results-attempt-email">
                    Expires {formatAnonymousDirectoryExpiry(survey.expiresAt)}
                  </span>
                </div>
                <h3>{survey.surveyTitle}</h3>
                {survey.surveyDescription ? <p>{survey.surveyDescription}</p> : null}
              </div>
              <a className="button-link compact-button primary-button" href={survey.publicUrl}>
                Start survey
              </a>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatAnonymousDirectoryExpiry(isoDate: string | null): string {
  if (!isoDate) {
    return "never";
  }

  const parsed = new Date(isoDate);

  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}
