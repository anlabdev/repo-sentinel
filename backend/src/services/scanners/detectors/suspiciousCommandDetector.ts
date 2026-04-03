import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, findLineNumber, snippetForLine } from "./common.js";

const COMMAND_PATTERN = /(curl\s+[^|]+\|\s*(sh|bash)|wget\s+[^|]+\|\s*(sh|bash)|Invoke-WebRequest|Start-Process|powershell\s+-enc|cmd\.exe\s+\/c|child_process|exec\(|spawn\(|ProcessBuilder|subprocess\.Popen|os\.system)/i;
const BUILD_SCRIPT_HINT = /(^|\/)(scripts|tools|ci|build|\.github)(\/|$)/i;

export const suspiciousCommandDetector: Detector = {
  name: "suspiciousCommandDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) {
        continue;
      }

      if (!/(\.sh|\.bash|\.ps1|\.cmd|\.bat|\.js|\.ts|\.jsx|\.tsx|\.py|\.java)$/i.test(file.relativePath)) {
        continue;
      }

      if (!COMMAND_PATTERN.test(file.content)) {
        continue;
      }

      const lineNumber = findLineNumber(file.content, COMMAND_PATTERN);
      const matchedLine = snippetForLine(file.content, lineNumber);
      const buildLikeScript = BUILD_SCRIPT_HINT.test(file.relativePath);
      findings.push(
        createFinding({
          ruleId: "command.execution.suspicious-shell-spawn",
          title: "Suspicious command execution pattern",
          summary: "Phát hiện pattern thực thi lệnh, shell spawn, hoặc download-and-run trong mã nguồn/script.",
          description: "Command execution, download-and-run, or shell spawning behavior was detected in code or scripts.",
          rationale: buildLikeScript
            ? "Script nằm trong khu vực CI/build nội bộ nên có thể hợp lệ, nhưng vẫn chứa primitive thực thi lệnh hoặc tải từ xa cần được review vì đây là điểm dễ bị lạm dụng."
            : "Mã nguồn gọi shell hoặc thực thi lệnh hệ thống trực tiếp. Đây là hành vi có rủi ro cao khi xuất hiện trong repository không rõ mục đích hoặc không được giới hạn đầu vào.",
          recommendation: "Xác minh mục đích thực thi lệnh, rà soát dữ liệu đầu vào, và tránh pattern download-then-execute nếu không thật sự cần thiết.",
          falsePositiveNote: buildLikeScript ? "Script CI/build nội bộ hợp lệ vẫn có thể dùng shell command. Cần đánh giá theo ngữ cảnh trigger, input, và quyền chạy thực tế." : undefined,
          severity: "high",
          confidence: buildLikeScript ? 0.74 : 0.9,
          category: "command-execution",
          filePath: file.relativePath,
          lineNumber,
          detector: "suspiciousCommandDetector",
          evidenceSnippet: matchedLine,
          tags: ["execution", "shell", "download-execute"],
          evidence: [createEvidence("Matched line", matchedLine)]
        })
      );
    }

    return findings;
  }
};
