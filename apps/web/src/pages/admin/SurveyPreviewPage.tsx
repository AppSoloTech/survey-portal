import type { ParticipantGlossaryEntry } from "@survey-portal/shared";
import { useEffect, useState } from "react";

import { fetchParticipantSafeGlossary } from "../../api/glossary.js";
import { SurveyPreviewPanel } from "../../components/admin/SurveyBuilderComponents.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyPreviewPage() {
  const { survey } = useSurveyWorkspace();
  const [glossaryEntries, setGlossaryEntries] = useState<ParticipantGlossaryEntry[]>([]);

  useEffect(() => {
    let isActive = true;

    fetchParticipantSafeGlossary()
      .then((response) => {
        if (isActive) {
          setGlossaryEntries(response.entries);
        }
      })
      .catch(() => {
        if (isActive) {
          setGlossaryEntries([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="builder-workspace">
      <SurveyPreviewPanel glossaryEntries={glossaryEntries} survey={survey} />
    </div>
  );
}
