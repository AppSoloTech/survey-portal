import type { Survey } from "@survey-portal/shared";
import { useMemo } from "react";

import { formatQuestionType } from "./SurveyBuilderComponents.js";
import {
  buildSurveyFlowGraph,
  truncateText,
  type SurveyFlowConditionalEdge,
  type SurveyFlowGraph,
  type SurveyFlowNode
} from "./surveyFlowGraph.js";

export function SurveyFlowMap({ survey }: { survey: Survey }) {
  const graph = useMemo(() => buildSurveyFlowGraph(survey), [survey]);
  const nodesByQuestionId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.questionId, node])),
    [graph]
  );

  return (
    <section className="builder-form advanced-builder-section flow-map-section" id="survey-flow">
      <div className="builder-section-heading">
        <div>
          <p className="eyebrow">Flow map</p>
          <h3>Survey flow map</h3>
          <p className="builder-heading-note">
            Read-only view derived from saved questions and jump rules. It updates as
            builder changes are saved and never edits survey data itself.
          </p>
        </div>
      </div>

      <div className="flow-map-legend" aria-label="Flow map legend">
        <span className="flow-legend-item normal">Normal flow</span>
        <span className="flow-legend-item conditional">Conditional jump</span>
        <span className="flow-legend-item skip">Conditional skip</span>
        <span className="flow-legend-item conditional-only">
          Conditional only (skipped in normal flow)
        </span>
      </div>

      <FlowIssueSummary graph={graph} />

      {graph.nodes.length === 0 ? (
        <div className="builder-empty-state compact">
          <strong>No questions to map</strong>
          <span>
            Add questions in the Questions section above to see the survey flow. Jump
            rules appear here once selection questions and rules exist.
          </span>
        </div>
      ) : (
        <ol className="flow-map-list">
          {graph.nodes.map((node) => (
            <FlowQuestionNode
              graph={graph}
              key={node.questionId}
              node={node}
              nodesByQuestionId={nodesByQuestionId}
            />
          ))}
        </ol>
      )}

      {graph.nodes.length > 0 && graph.conditionalEdges.length === 0 ? (
        <p className="flow-map-footnote">
          No jump rules configured. Every participant follows the normal question order.
        </p>
      ) : null}
    </section>
  );
}

function FlowIssueSummary({ graph }: { graph: SurveyFlowGraph }) {
  if (graph.issues.length === 0) {
    return (
      <p className="flow-issue-clear">
        No flow issues detected. All paths and rule references look valid.
      </p>
    );
  }

  return (
    <div className="flow-issue-panel">
      <strong>
        {graph.issues.length} informational {graph.issues.length === 1 ? "issue" : "issues"} found
      </strong>
      <span className="flow-issue-panel-note">
        These checks are informational only. Nothing is changed automatically, and
        publish validation still runs on the server.
      </span>
      <ul>
        {graph.issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.ruleId ?? "x"}-${issue.questionId ?? "x"}-${index}`}>
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowQuestionNode({
  graph,
  node,
  nodesByQuestionId
}: {
  graph: SurveyFlowGraph;
  node: SurveyFlowNode;
  nodesByQuestionId: Map<number, SurveyFlowNode>;
}) {
  const outgoingEdges = graph.conditionalEdges.filter(
    (edge) => edge.sourceQuestionId === node.questionId
  );
  const incomingEdges = graph.conditionalEdges.filter(
    (edge) => edge.targetQuestionId === node.questionId
  );
  const incomingJumpEdges = incomingEdges.filter(
    (edge) => edge.actionType === "JUMP_TO_QUESTION"
  );
  const incomingSkipEdges = incomingEdges.filter((edge) => edge.actionType === "HIDE_QUESTION");
  const incomingNonExecutedEdges = incomingEdges.filter(
    (edge) => edge.actionType !== "JUMP_TO_QUESTION" && edge.actionType !== "HIDE_QUESTION"
  );
  const nodeClassNames = [
    "flow-node",
    node.isConditionalOnly ? "conditional-only" : "",
    node.isReachable ? "" : "unreachable"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={nodeClassNames}>
      <div className="flow-node-header">
        <span className="flow-node-order" aria-hidden="true">
          {node.displayOrder}
        </span>
        <div>
          <div className="question-meta-strip flow-node-badges">
            <span>Question {node.displayOrder}</span>
            <span>{formatQuestionType(node.questionType)}</span>
            <span>{node.isRequired ? "Required" : "Optional"}</span>
            {node.isStart ? <span className="flow-badge start">Start</span> : null}
            {node.isConditionalOnly ? (
              <span className="flow-badge conditional-only">Conditional only</span>
            ) : null}
            {!node.isReachable ? <span className="flow-badge issue">Unreachable</span> : null}
          </div>
          <p className="flow-node-text">{node.questionText}</p>
        </div>
      </div>

      <div className="flow-node-paths">
        <p className="flow-path normal">
          {describeNormalFlow(node, nodesByQuestionId)}
        </p>

        {incomingJumpEdges.length > 0 ? (
          <p className="flow-path incoming">
            Jump target of {incomingJumpEdges.length === 1 ? "rule" : "rules"}{" "}
            {incomingJumpEdges
              .map((edge) => describeIncomingEdge(edge, nodesByQuestionId))
              .join("; ")}
          </p>
        ) : null}

        {incomingSkipEdges.length > 0 ? (
          <p className="flow-path incoming">
            Skipped by {incomingSkipEdges.length === 1 ? "rule" : "rules"}{" "}
            {incomingSkipEdges
              .map((edge) => describeIncomingEdge(edge, nodesByQuestionId))
              .join("; ")}
          </p>
        ) : null}

        {incomingNonExecutedEdges.length > 0 ? (
          <p className="flow-path incoming">
            Referenced as the target of non-executed{" "}
            {incomingNonExecutedEdges.length === 1 ? "rule" : "rules"}{" "}
            {incomingNonExecutedEdges
              .map(
                (edge) =>
                  `${describeIncomingEdge(edge, nodesByQuestionId)} (action ${edge.actionType})`
              )
              .join("; ")}
          </p>
        ) : null}

        {outgoingEdges.map((edge) => (
          <p className="flow-path conditional" key={edge.ruleId}>
            {describeOutgoingEdge(edge, nodesByQuestionId)}
            {edge.issues.length > 0 ? (
              <span className="flow-path-issue"> Needs attention: see issues above.</span>
            ) : null}
          </p>
        ))}
      </div>
    </li>
  );
}

function describeNormalFlow(
  node: SurveyFlowNode,
  nodesByQuestionId: Map<number, SurveyFlowNode>
): string {
  const nextLabel =
    node.normalNextQuestionId !== null
      ? `continues to ${formatNodeReference(nodesByQuestionId.get(node.normalNextQuestionId))}`
      : "ends the survey";

  if (node.isConditionalOnly) {
    return `Skipped in normal flow. After a jump lands here, the survey ${nextLabel}.`;
  }

  return `Normal flow ${nextLabel}.`;
}

function describeOutgoingEdge(
  edge: SurveyFlowConditionalEdge,
  nodesByQuestionId: Map<number, SurveyFlowNode>
): string {
  const optionLabel = edge.sourceOptionText
    ? `"${truncateText(edge.sourceOptionText, 40)}"`
    : `option id ${edge.sourceAnswerOptionId} (missing)`;
  const targetNode =
    edge.targetQuestionId !== null ? nodesByQuestionId.get(edge.targetQuestionId) : undefined;
  const targetLabel = targetNode
    ? formatNodeReference(targetNode)
    : edge.targetQuestionId !== null
      ? `missing question id ${edge.targetQuestionId}`
      : "a missing target";

  if (edge.actionType === "HIDE_QUESTION") {
    return `If answer is ${optionLabel}, skip ${targetLabel}.`;
  }

  if (edge.actionType !== "JUMP_TO_QUESTION") {
    return `If answer is ${optionLabel}: rule action ${edge.actionType} targets ${targetLabel} but is not executed by the runtime.`;
  }

  const skipLabel = edge.skipTargetInNormalFlow
    ? " Target is skipped in normal flow."
    : " Target also stays in normal flow.";

  return `If answer is ${optionLabel}, jump to ${targetLabel}.${skipLabel}`;
}

function describeIncomingEdge(
  edge: SurveyFlowConditionalEdge,
  nodesByQuestionId: Map<number, SurveyFlowNode>
): string {
  const sourceNode = nodesByQuestionId.get(edge.sourceQuestionId);
  const sourceLabel = sourceNode
    ? formatNodeReference(sourceNode)
    : `missing question id ${edge.sourceQuestionId}`;
  const optionLabel = edge.sourceOptionText
    ? ` when "${truncateText(edge.sourceOptionText, 40)}" is selected`
    : "";

  return `from ${sourceLabel}${optionLabel}`;
}

function formatNodeReference(node: SurveyFlowNode | undefined): string {
  if (!node) {
    return "a missing question";
  }

  return `question ${node.displayOrder} ("${truncateText(node.questionText, 48)}")`;
}
