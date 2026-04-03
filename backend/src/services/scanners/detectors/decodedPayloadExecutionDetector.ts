import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, snippetForLine } from "./common.js";
import { findPatternLine, getBehaviorProfile, hasPattern } from "./languageProfiles.js";

const BUILD_SCRIPT_HINT = /(^|\/)(scripts|tools|ci|build|\.github)(\/|$)/i;

export const decodedPayloadExecutionDetector: Detector = {
  name: "decodedPayloadExecutionDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) continue;
      const profile = getBehaviorProfile(file.relativePath, file.content);
      if (!profile) continue;
      if (!hasPattern(file.content, profile.profile.decode) || !hasPattern(file.content, profile.profile.write) || !hasPattern(file.content, profile.profile.execute)) continue;
      if (!hasPattern(file.content, profile.profile.suspiciousDecodeContext)) continue;

      const decodeLine = findPatternLine(file.content, profile.profile.decode);
      const writeLine = findPatternLine(file.content, profile.profile.write);
      const executeLine = findPatternLine(file.content, profile.profile.execute);
      const primaryLine = executeLine ?? writeLine ?? decodeLine;
      const buildLikeScript = BUILD_SCRIPT_HINT.test(file.relativePath);
      const relatedLineNumbers = [decodeLine, writeLine, executeLine].filter((value): value is number => typeof value === "number");
      const evidence = [
        decodeLine ? createEvidence("Decode step", snippetForLine(file.content, decodeLine)) : undefined,
        writeLine ? createEvidence("Write step", snippetForLine(file.content, writeLine)) : undefined,
        executeLine ? createEvidence("Execute step", snippetForLine(file.content, executeLine)) : undefined,
        createEvidence("Language", profile.language, "metadata")
      ].filter(Boolean) as NonNullable<Finding["evidence"]>;

      findings.push(createFinding({
        ruleId: "execution.chain.decode-write-execute",
        title: `Decoded payload write-and-execute chain detected (${profile.language})`,
        summary: "Phát hiện chuỗi giải mã nội dung encode rồi ghi xuống tệp/buffer cục bộ và thực thi trong cùng file.",
        description: "A decoded payload is written locally and executed in the same file.",
        rationale: buildLikeScript
          ? `Script ${profile.language} thuộc vùng build/install nên có thể phục vụ bootstrap nội bộ, nhưng mô thức giải mã payload rồi ghi file và thực thi vẫn là chuỗi rủi ro cao thường gặp ở loader hoặc dropper.`
          : `Chuỗi giải mã -> ghi xuống -> thực thi trong file ${profile.language} là mẫu điển hình của payload loader, stager, hoặc mã cố che giấu hành vi thực thi bằng obfuscation. Khi cả ba bước xuất hiện cùng nhau, tín hiệu mạnh hơn hẳn so với từng primitive riêng lẻ.`,
        recommendation: "Loại bỏ việc thực thi payload vừa giải mã nếu không thật sự cần, thay bằng artifact minh bạch hoặc tài nguyên đã xác minh checksum/chữ ký, và rà soát kỹ mọi bước decode động trong source.",
        falsePositiveNote: buildLikeScript ? "Một số bootstrap/install script hợp lệ có thể giải nén hoặc decode tài nguyên trước khi chạy. Hãy xác minh nguồn dữ liệu, nơi ghi file, và điều kiện trigger trước khi kết luận an toàn." : undefined,
        severity: buildLikeScript ? "high" : "critical",
        confidence: buildLikeScript ? 0.82 : 0.95,
        category: "execution",
        filePath: file.relativePath,
        lineNumber: primaryLine,
        relatedLineNumbers,
        matchCount: relatedLineNumbers.length,
        detector: "decodedPayloadExecutionDetector",
        evidenceSnippet: snippetForLine(file.content, primaryLine),
        tags: ["execution", "decode", "payload", "stager", "obfuscation", profile.language],
        evidence
      }));
    }

    return findings;
  }
};

