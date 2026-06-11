import { SurveyPreviewPanel } from "../../components/admin/SurveyBuilderComponents.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyPreviewPage() {
  const { survey } = useSurveyWorkspace();

  return (
    <div className="builder-workspace">
      <SurveyPreviewPanel survey={survey} />
    </div>
  );
}
