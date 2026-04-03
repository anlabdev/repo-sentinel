import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, snippetForLine } from "./common.js";
import { findPatternLine, getBehaviorProfile, hasPattern } from "./languageProfiles.js";

const TEST_HINT = /(^|\/)(tests?|fixtures|samples|examples?)(\/|$)/i;

export const secretExfilChainDetector: Detector = {
  name: "secretExfilChainDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) continue;
      const profile = getBehaviorProfile(file.relativePath, file.content);
      if (!profile) continue;
      if (!hasPattern(file.content, profile.profile.secretRead) || !hasPattern(file.content, profile.profile.networkSend)) continue;

      const secretLine = findPatternLine(file.content, profile.profile.secretRead);
      const networkLine = findPatternLine(file.content, profile.profile.networkSend);
      const primaryLine = networkLine ?? secretLine;
      const testLike = TEST_HINT.test(file.relativePath);
      const relatedLineNumbers = [secretLine, networkLine].filter((value): value is number => typeof value === "number");
      const evidence = [
        secretLine ? createEvidence("Secret read", snippetForLine(file.content, secretLine)) : undefined,
        networkLine ? createEvidence("Network send", snippetForLine(file.content, networkLine)) : undefined,
        createEvidence("Language", profile.language, "metadata")
      ].filter(Boolean) as NonNullable<Finding["evidence"]>;

      findings.push(createFinding({
        ruleId: "execution.chain.secret-read-exfiltration",
        title: `Secret read and outbound exfiltration chain detected (${profile.language})`,
        summary: "Phát hiện file vừa đọc secret/env/token vừa thực hiện request mạng ra ngoài trong cùng ngữ cảnh mã nguồn.",
        description: "The file reads secrets or environment credentials and also performs outbound network transmission.",
        rationale: testLike
          ? `File ${profile.language} nằm trong vùng test/fixture nên có thể mô phỏng luồng gửi credential cho integration test, nhưng vẫn mang mô thức exfiltration nên cần xác minh endpoint, dữ liệu, và dữ liệu mẫu có phải thật hay không.`
          : `Việc đọc token, password, bearer header hoặc env nhạy cảm rồi kết hợp request mạng ra ngoài trong file ${profile.language} là chuỗi hành vi thường gặp trong credential exfiltration, beaconing, hoặc data leakage. Khi cả hai bước xuất hiện cùng file, mức rủi ro cao hơn so với từng primitive đơn lẻ.`,
        recommendation: "Xác minh dữ liệu nào được lấy từ env/secret store, chặn gửi credential trực tiếp qua network call, dùng secret manager hoặc token ngắn hạn, và audit rõ endpoint đích trước khi cho phép chạy.",
        falsePositiveNote: testLike ? "Fixture hoặc integration test hợp lệ có thể mô phỏng việc gửi credential. Hãy chắc đây là dữ liệu giả và endpoint không phải dịch vụ thật trước khi coi là an toàn." : undefined,
        severity: testLike ? "medium" : "high",
        confidence: testLike ? 0.74 : 0.9,
        category: "execution",
        filePath: file.relativePath,
        lineNumber: primaryLine,
        relatedLineNumbers,
        matchCount: relatedLineNumbers.length,
        detector: "secretExfilChainDetector",
        evidenceSnippet: snippetForLine(file.content, primaryLine),
        tags: ["execution", "secret", "exfiltration", "network", profile.language],
        evidence
      }));
    }

    return findings;
  }
};

