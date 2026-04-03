import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, snippetForLine } from "./common.js";
import { findPatternLine, getBehaviorProfile, hasPattern } from "./languageProfiles.js";

const BUILD_SCRIPT_HINT = /(^|\/)(scripts|tools|ci|build|\.github)(\/|$)/i;

export const suspiciousCommandDetector: Detector = {
  name: "suspiciousCommandDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) continue;
      const profile = getBehaviorProfile(file.relativePath, file.content);
      if (!profile || !hasPattern(file.content, profile.profile.command)) continue;

      const lineNumber = findPatternLine(file.content, profile.profile.command);
      const matchedLine = snippetForLine(file.content, lineNumber);
      const buildLikeScript = BUILD_SCRIPT_HINT.test(file.relativePath);
      findings.push(createFinding({
        ruleId: "execution.suspicious-shell-spawn",
        title: `Suspicious command execution pattern (${profile.language})`,
        summary: "Phát hiện pattern thực thi lệnh, shell spawn, hoặc download-and-run trong mã nguồn/script.",
        description: "Command execution, download-and-run, or shell spawning behavior was detected in code or scripts.",
        rationale: buildLikeScript
          ? `File ${profile.language} nằm trong khu vực CI/build nội bộ nên có thể hợp lệ, nhưng vẫn chứa primitive thực thi lệnh hoặc tải từ xa cần được review vì đây là điểm dễ bị lạm dụng.`
          : `Mã nguồn ${profile.language} gọi shell hoặc thực thi lệnh hệ thống trực tiếp. Đây là hành vi có rủi ro cao khi xuất hiện trong repository không rõ mục đích hoặc không được giới hạn đầu vào.`,
        recommendation: "Tránh dùng exec hoặc shell spawn nếu không thật sự cần, dùng API/library an toàn hơn khi có thể, xác thực đầu vào, và giới hạn quyền runtime của tiến trình chạy lệnh.",
        falsePositiveNote: buildLikeScript ? "Script CI/build nội bộ hợp lệ vẫn có thể dùng shell command. Cần đánh giá theo ngữ cảnh trigger, input, và quyền chạy thực tế." : undefined,
        severity: "high",
        confidence: buildLikeScript ? 0.74 : 0.9,
        category: "execution",
        filePath: file.relativePath,
        lineNumber,
        detector: "suspiciousCommandDetector",
        evidenceSnippet: matchedLine,
        tags: ["execution", "shell", "download-execute", profile.language],
        evidence: [createEvidence("Matched line", matchedLine), createEvidence("Language", profile.language, "metadata")]
      }));
    }

    return findings;
  }
};

