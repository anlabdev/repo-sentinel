import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, findLineNumber, snippetForLine } from "./common.js";

const FILE_HINT = /(\.(js|ts|jsx|tsx|py|ps1|sh|bash|java|yml|yaml|json))$/i;
const EXFIL_PATTERN = /(requests\.post|axios\.(post|put)|fetch\(|Invoke-WebRequest|curl\s+.*(http|https)|wget\s+.*(http|https)|WebClient\(|HttpClient\()(.|\n){0,220}(process\.env|os\.environ|System\.getenv|secrets\.|Authorization|Bearer\s+|token|password|secret)/i;
const TEST_HINT = /(^|\/)(tests?|fixtures|samples|examples?)(\/|$)/i;

export const exfiltrationDetector: Detector = {
  name: "exfiltrationDetector",
  detect({ files }) {
    const findings: Finding[] = [];
    for (const file of files) {
      if (!file.content || !FILE_HINT.test(file.relativePath) || !EXFIL_PATTERN.test(file.content)) continue;
      const lineNumber = findLineNumber(file.content, EXFIL_PATTERN);
      const matchedLine = snippetForLine(file.content, lineNumber);
      const testLike = TEST_HINT.test(file.relativePath);
      findings.push(createFinding({
        ruleId: "execution.exfiltration.secret-over-network",
        title: "Potential secret exfiltration over network",
        summary: "Phát hiện lệnh gửi dữ liệu hoặc request mạng có đi kèm token/secret/env nhạy cảm.",
        description: "The file combines outbound network calls with secret-like values or environment credentials.",
        rationale: testLike ? "Đây có thể là fixture hoặc ví dụ test cho HTTP client, nhưng vẫn chứa mô thức gửi dữ liệu nhạy cảm qua mạng nên cần xác minh." : "File kết hợp request mạng với token, password, bearer header, hoặc đọc biến môi trường nhạy cảm. Đây là mô thức thường gặp trong credential exfiltration hoặc beaconing.",
        recommendation: "Rà soát luồng dữ liệu ra ngoài, tránh gửi secret trực tiếp qua request, và dùng secret manager cùng audit logging cho mọi tích hợp mạng nhạy cảm.",
        falsePositiveNote: testLike ? "Fixture/test hợp lệ có thể mô phỏng luồng gửi secret. Hãy xác minh đây là test data và không trỏ tới endpoint thật." : undefined,
        severity: testLike ? "medium" : "high",
        confidence: testLike ? 0.7 : 0.84,
        category: "execution",
        filePath: file.relativePath,
        lineNumber,
        detector: "exfiltrationDetector",
        evidenceSnippet: matchedLine,
        tags: ["network", "exfiltration", "secret"],
        evidence: [createEvidence("Matched line", matchedLine), createEvidence("Pattern family", "Outbound network + secret", "metadata")]
      }));
    }
    return findings;
  }
};
