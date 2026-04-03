import path from "node:path";
import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding } from "./common.js";
import { isProbablyBinary } from "../../../utils/file-system.js";

const SENSITIVE_FILENAMES = [
  { ruleId: "filename.env.sensitive-config", pattern: /^\.env(?:\..+)?$/i, title: "Sensitive environment file committed", severity: "medium" as const, category: "credential-file" as const },
  { ruleId: "filename.private-key.candidate", pattern: /^id_(rsa|dsa|ecdsa|ed25519)$/i, title: "Private key filename detected", severity: "high" as const, category: "credential-file" as const },
  { ruleId: "filename.payload.like", pattern: /(loader|payload|dropper|implant|beacon)/i, title: "Payload-like filename detected", severity: "medium" as const, category: "filename" as const },
  { ruleId: "filename.credential.like", pattern: /(password|credential|secret)/i, title: "Credential-like filename detected", severity: "medium" as const, category: "filename" as const }
];

export const suspiciousFilenameDetector: Detector = {
  name: "suspiciousFilenameDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      const base = path.basename(file.relativePath);
      for (const rule of SENSITIVE_FILENAMES) {
        if (!rule.pattern.test(base)) {
          continue;
        }

        findings.push(
          createFinding({
            ruleId: rule.ruleId,
            title: rule.title,
            summary: `Tên file ${base} gợi ý đây là file nhạy cảm hoặc artifact nên được rà soát kỹ hơn.`,
            description: "Filename suggests a sensitive config, credential artifact, or payload-related file.",
            rationale: rule.ruleId === "filename.env.sensitive-config"
              ? "File `.env` hoặc biến thể của nó thường chứa thông tin cấu hình nhạy cảm. Mức độ rủi ro thực tế phụ thuộc vào nội dung bên trong file, không chỉ tên file."
              : "Tên file gợi ý credential, private key, hoặc payload operational artifact. Những file kiểu này nên được commit có chủ đích và có chú thích rõ ràng.",
            recommendation: rule.ruleId === "filename.env.sensitive-config"
              ? "Kiểm tra nội dung thực tế của file để xác định có secret hay không; nếu chỉ là template thì đổi thành `.env.example` hoặc tương đương."
              : "Xác minh xem file này có cần nằm trong repository hay không, và bổ sung tài liệu/ghi chú nếu đây là artifact hợp lệ.",
            falsePositiveNote: rule.ruleId === "filename.env.sensitive-config"
              ? "Không phải mọi file `.env` đều chứa secret thật. Template hoặc file demo có thể hợp lệ nếu không chứa thông tin xác thực thực tế."
              : undefined,
            severity: rule.severity,
            confidence: rule.ruleId === "filename.private-key.candidate" ? 0.9 : 0.68,
            category: rule.category,
            filePath: file.relativePath,
            detector: "suspiciousFilenameDetector",
            evidenceSnippet: base,
            tags: ["filename", rule.category],
            evidence: [
              createEvidence("Filename", base, "path"),
              createEvidence("Relative path", file.relativePath, "path")
            ]
          })
        );
      }

      if (isProbablyBinary(file) && /(^|\/)\./.test(file.relativePath)) {
        findings.push(
          createFinding({
            ruleId: "binary.hidden-artifact",
            title: "Hidden binary-like artifact",
            summary: "Một file ẩn có đặc trưng nhị phân xuất hiện trong repository.",
            description: "A hidden file appears binary-like and should be reviewed for opaque bundled payloads.",
            rationale: "File ẩn có nội dung nhị phân thường khó review và có thể bị dùng để giấu artifact, payload, hoặc data opaque không minh bạch.",
            recommendation: "Kiểm tra file này có cần thiết không. Nếu hợp lệ, nên tài liệu hóa nguồn gốc và mục đích; nếu không, loại khỏi repository.",
            falsePositiveNote: "Một số IDE hoặc tool có thể tạo file metadata nhị phân. Cần xác minh nguồn gốc file trước khi coi đây là payload.",
            severity: "high",
            confidence: 0.84,
            category: "binary-artifact",
            filePath: file.relativePath,
            detector: "suspiciousFilenameDetector",
            evidenceSnippet: `${file.relativePath} (${file.size} bytes)`,
            tags: ["binary", "hidden-file"],
            evidence: [
              createEvidence("Artifact path", file.relativePath, "path"),
              createEvidence("Artifact size", String(file.size), "metadata")
            ]
          })
        );
      }
    }

    return findings;
  }
};
