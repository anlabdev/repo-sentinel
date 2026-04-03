import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, snippetForLine } from "./common.js";
import { findPatternLine, getBehaviorProfile, hasPattern } from "./languageProfiles.js";

const BUILD_SCRIPT_HINT = /(^|\/)(scripts|tools|ci|build|\.github)(\/|$)/i;

export const stagedPayloadDetector: Detector = {
  name: "stagedPayloadDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) continue;
      const profile = getBehaviorProfile(file.relativePath, file.content);
      if (!profile) continue;
      if (!hasPattern(file.content, profile.profile.download) || !hasPattern(file.content, profile.profile.write) || !hasPattern(file.content, profile.profile.execute)) continue;

      const downloadLine = findPatternLine(file.content, profile.profile.download);
      const writeLine = findPatternLine(file.content, profile.profile.write);
      const executeLine = findPatternLine(file.content, profile.profile.execute);
      const primaryLine = executeLine ?? writeLine ?? downloadLine;
      const buildLikeScript = BUILD_SCRIPT_HINT.test(file.relativePath);
      const relatedLineNumbers = [downloadLine, writeLine, executeLine].filter((value): value is number => typeof value === "number");
      const evidence = [
        downloadLine ? createEvidence("Download step", snippetForLine(file.content, downloadLine)) : undefined,
        writeLine ? createEvidence("Write step", snippetForLine(file.content, writeLine)) : undefined,
        executeLine ? createEvidence("Execute step", snippetForLine(file.content, executeLine)) : undefined,
        createEvidence("Language", profile.language, "metadata")
      ].filter(Boolean) as NonNullable<Finding["evidence"]>;

      findings.push(createFinding({
        ruleId: "execution.chain.download-write-execute",
        title: `Staged download-write-execute chain detected (${profile.language})`,
        summary: "Phát hiện chuỗi hành vi tải dữ liệu từ xa, ghi ra tệp/buffer cục bộ rồi thực thi trong cùng file.",
        description: "A staged behavior chain that downloads data, writes it locally, and then executes it was detected in the same file.",
        rationale: buildLikeScript
          ? `File ${profile.language} nằm trong khu vực script/build nên có thể phục vụ installer nội bộ, nhưng việc vừa tải dữ liệu, vừa ghi xuống đĩa rồi thực thi vẫn là chuỗi hành vi rủi ro cao và cần xác minh nguồn gốc thật kỹ.`
          : `Chuỗi tải về -> ghi xuống -> thực thi trong file ${profile.language} là mô thức rất phổ biến trong downloader, stager, và mã triển khai payload. Khi ba bước này xuất hiện cùng nhau trong một file, mức rủi ro cao hơn rõ rệt so với từng primitive riêng lẻ.`,
        recommendation: "Xác minh mục đích business của từng bước tải/ghi/chạy, loại bỏ việc thực thi trực tiếp nội dung tải về khi có thể, kiểm tra checksum/chữ ký trước khi dùng, và thay bằng quy trình build hoặc artifact minh bạch hơn.",
        falsePositiveNote: buildLikeScript ? "Installer hoặc bootstrap script nội bộ hợp lệ vẫn có thể chứa chuỗi này, nhưng cần xác thực nguồn tải, vị trí ghi file, và điều kiện trigger trước khi coi là an toàn." : undefined,
        severity: buildLikeScript ? "high" : "critical",
        confidence: buildLikeScript ? 0.79 : 0.93,
        category: "execution",
        filePath: file.relativePath,
        lineNumber: primaryLine,
        relatedLineNumbers,
        matchCount: relatedLineNumbers.length,
        detector: "stagedPayloadDetector",
        evidenceSnippet: snippetForLine(file.content, primaryLine),
        tags: ["execution", "download", "payload", "stager", profile.language],
        evidence
      }));
    }

    return findings;
  }
};

