import path from "node:path";
import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding } from "./common.js";
import { isProbablyBinary } from "../../../utils/file-system.js";

const FILENAME_RULES = [
  { ruleId: "filename.env.sensitive-config", pattern: /^\.env(?:\..+)?$/i, title: "Sensitive environment-style filename detected" },
  { ruleId: "filename.private-key.candidate", pattern: /^id_(rsa|dsa|ecdsa|ed25519)$/i, title: "Private key style filename detected" },
  { ruleId: "filename.payload.like", pattern: /(loader|payload|dropper|implant|beacon)/i, title: "Payload-like filename detected" },
  { ruleId: "filename.credential.like", pattern: /(password|credential|secret)/i, title: "Credential-like filename detected" }
] as const;

const DOC_PATH = /(^|\/)(docs?|examples?|guides?|notes?)(\/|$)/i;
const BUILD_PATH = /(^|\/)(dist|build|target|bin|out|release|debug|vendor|third_party|third-party|\.gradle|\.m2|obj|lib|libs|cache)(\/|$)/i;
const SOURCE_PATH = /(^|\/)(src|app|scripts|config|public|static|assets|\.github)(\/|$)/i;
const DOC_EXT = /\.(md|mdx|txt|rst|adoc)$/i;
const BINARY_EXT = /\.(jar|exe|dll|so|bin|apk|class|pyc)$/i;
const NORMAL_DOC_CONTENT = /(flow|guide|documentation|reset password|backup retention|runbook|how to|steps?)/i;

export const suspiciousFilenameDetector: Detector = {
  name: "suspiciousFilenameDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      const base = path.basename(file.relativePath);
      for (const rule of FILENAME_RULES) {
        if (!rule.pattern.test(base)) {
          continue;
        }

        const isDocLike = DOC_PATH.test(file.relativePath) || DOC_EXT.test(file.relativePath);
        const isBinaryNamed = BINARY_EXT.test(base) || isProbablyBinary(file);
        const inBuildDir = BUILD_PATH.test(file.relativePath);
        const inSourceTree = SOURCE_PATH.test(file.relativePath) && !inBuildDir;
        const contentLooksBenignDoc = Boolean(file.content && isDocLike && NORMAL_DOC_CONTENT.test(file.content));

        let severity: Finding["severity"] = "low";
        let confidence = 0.34;
        let category: Finding["category"] = "filename-risk";
        let rationale = `Tên file ${base} gợi ý đây có thể là file nhạy cảm hoặc artifact cần được review, nhưng tên file chỉ là tín hiệu phụ chứ chưa đủ để kết luận rủi ro thực sự.`;
        let recommendation = "Đọc nội dung thực tế và xem ngữ cảnh thư mục để xác định đây là file hợp lệ hay chỉ là naming bình thường.";
        let falsePositiveNote: string | undefined = "Tên file dễ gây hiểu nhầm. Cần dựa vào nội dung thật và vị trí file trước khi nâng mức rủi ro.";

        if (rule.ruleId === "filename.env.sensitive-config") {
          category = "config-risk";
          severity = "low";
          confidence = 0.3;
          rationale = "Tên file cho thấy đây là file cấu hình môi trường. Rủi ro thực tế phụ thuộc vào việc bên trong có secret thật hay chỉ là template/demo.";
          recommendation = "Nếu đây chỉ là template, đổi sang .env.example hoặc file mẫu tương tự. Chỉ nâng mức xử lý khi nội dung thật sự chứa secret pattern.";
          falsePositiveNote = "Không nên coi mọi file .env là rò rỉ secret. Template hoặc file local stub có thể hoàn toàn hợp lệ.";
        } else if (rule.ruleId === "filename.private-key.candidate") {
          severity = "medium";
          confidence = 0.62;
          rationale = "Tên file giống private key SSH. Nếu nội dung thật sự là key material thì detector chuyên dụng sẽ flag mạnh hơn; nếu không, đây vẫn là dấu hiệu cần xem kỹ.";
          recommendation = "Xác minh nội dung file. Nếu là key thật, loại khỏi repo và rotate khóa; nếu không phải, đổi tên rõ nghĩa hơn để tránh nhầm lẫn.";
          falsePositiveNote = undefined;
        } else if (isDocLike || contentLooksBenignDoc) {
          severity = "low";
          confidence = 0.24;
          rationale = "Tên file chứa từ khóa nhạy cảm nhưng file nằm trong tài liệu hoặc mô tả luồng nghiệp vụ, nên khả năng cao chỉ là documentation hợp lệ.";
          recommendation = "Giữ file tài liệu này nếu nội dung chỉ mang tính mô tả. Có thể thêm chú thích rõ đây là doc để giảm cảnh báo nhầm về sau.";
          falsePositiveNote = "Tài liệu như password reset flow hoặc backup guide thường hợp lệ và không nên bị xem là credential leak nếu không chứa secret thật.";
        } else if (isBinaryNamed) {
          severity = inBuildDir ? "low" : inSourceTree ? "medium" : "low";
          confidence = inBuildDir ? 0.22 : inSourceTree ? 0.48 : 0.3;
          rationale = inBuildDir
            ? "Tên file kiểu payload/credential xuất hiện trên binary artifact trong thư mục build/cache. Vị trí này làm giảm độ chắc chắn vì có thể chỉ là output hợp lệ hoặc fixture nội bộ."
            : "Tên file kiểu payload/credential gắn với binary artifact nằm trong source tree. Đây là tín hiệu phụ cho thấy file nên được xem xét cùng detector artifact mạnh hơn.";
          recommendation = inBuildDir
            ? "Kiểm tra file này có phải artifact build/fixture hợp lệ không. Nếu có, ưu tiên tài liệu hóa thay vì coi đây là payload ngay lập tức."
            : "Kiểm tra nguồn gốc binary này và xác nhận có nên nằm trong source tree hay không.";
        } else if (inSourceTree) {
          severity = "low";
          confidence = 0.4;
          rationale = "Tên file gợi ý credential/payload và nằm trong source tree, nhưng nếu chưa có tín hiệu nội dung đi kèm thì đây vẫn chỉ nên được xem là chỉ dấu tên file mức thấp.";
          recommendation = "Đọc nội dung file, xác minh mục đích, và chỉ nâng mức nếu tìm thấy thêm tín hiệu từ nội dung hoặc hành vi thực thi.";
        }

        findings.push(
          createFinding({
            ruleId: rule.ruleId,
            title: rule.title,
            summary: `Tên file ${base} gợi ý có thể liên quan tới cấu hình nhạy cảm, credential, hoặc payload, nhưng cần xác minh bằng nội dung thật.`,
            description: "Filename indicates potentially sensitive or operational content, but the filename signal alone is not sufficient.",
            rationale,
            recommendation,
            falsePositiveNote,
            severity,
            confidence,
            category,
            filePath: file.relativePath,
            detector: "suspiciousFilenameDetector",
            evidenceSnippet: base,
            tags: ["filename", category],
            evidence: [
              createEvidence("Filename", base, "path"),
              createEvidence("Relative path", file.relativePath, "path")
            ]
          })
        );
      }
    }

    return findings;
  }
};
