import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, findLineNumber, snippetForLine } from "./common.js";

const WORKFLOW_PATTERN = /(pull_request_target|workflow_run|schedule:|secrets\.[A-Z0-9_]+|persist-credentials:\s*true|curl\s+|wget\s+|bash\s+-c)/i;
const SAFE_BUILD_HINT = /(npm\s+(ci|install|run\s+build)|pnpm\s+install|yarn\s+install)/i;

export const workflowRiskDetector: Detector = {
  name: "workflowRiskDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content || !/\.github\/workflows\/.*\.ya?ml$/i.test(file.relativePath)) continue;
      if (!WORKFLOW_PATTERN.test(file.content)) continue;

      const lineNumber = findLineNumber(file.content, WORKFLOW_PATTERN);
      const matchedLine = snippetForLine(file.content, lineNumber);
      findings.push(createFinding({
        ruleId: "workflow.github-actions.elevated-execution",
        title: "Suspicious GitHub Actions workflow behavior",
        summary: "Workflow CI chứa trigger hoặc command có quyền/rủi ro cao hơn mức build thông thường.",
        description: "The workflow uses elevated triggers, secrets exposure, or direct remote command execution patterns.",
        rationale: SAFE_BUILD_HINT.test(matchedLine)
          ? "Workflow có thể là build pipeline hợp lệ nhưng vẫn chứa điểm cần review như persist-credentials, secret exposure, hoặc trigger nhạy cảm."
          : "Workflow dùng trigger đặc quyền, lệnh tải từ xa, hoặc thao tác với secrets theo cách có thể bị lạm dụng để thực thi code ngoài ý muốn trong CI.",
        recommendation: "Kiểm tra trigger, quyền token, và command chạy trong workflow; hạn chế remote execution, giảm secret scope, và tắt persist-credentials nếu không cần thiết.",
        falsePositiveNote: "Nhiều workflow release/deploy hợp lệ cần quyền cao hơn workflow test thông thường. Hãy đánh giá theo branch protection, actor, và secret scope thực tế.",
        severity: "high",
        confidence: 0.83,
        category: "workflow",
        filePath: file.relativePath,
        lineNumber,
        detector: "workflowRiskDetector",
        evidenceSnippet: matchedLine,
        tags: ["github-actions", "workflow", "ci"],
        evidence: [createEvidence("Matched line", matchedLine)]
      }));
    }

    return findings;
  }
};
