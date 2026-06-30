import type { SurveyAttemptSummary } from "@survey-portal/shared";
import { useEffect, useState } from "react";

import { fetchMySurveys } from "../api/surveys.js";

export function useMySurveys() {
  const [summaries, setSummaries] = useState<SurveyAttemptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    fetchMySurveys()
      .then((response) => {
        if (isActive) {
          setSummaries(response.surveys);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load assessments");
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

  return { summaries, isLoading, error };
}
