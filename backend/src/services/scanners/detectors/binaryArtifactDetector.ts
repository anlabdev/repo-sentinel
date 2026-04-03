import path from "node:path";
import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding } from "./common.js";
import { isProbablyBinary } from "../../../utils/file-system.js";

const BINARY_EXTENSIONS = new Set([".jar", ".exe", ".dll", ".so", ".bin", ".apk", ".class", ".pyc"]);
const BUILD_DIR_PATTERN = /(^|\/)(dist|build|target|bin|out|release|debug|vendor|third_party|third-party|\.gradle|\.m2|obj|lib|libs|cache)(\/|$)/i;
const UNUSUAL_DIR_PATTERN = /(^|\/)(src|app|scripts|config|\.github|\.idea|public|assets|static)(\/|$)/i;

export const binaryArtifactDetector: Detector = {
  name: "binaryArtifactDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      const ext = path.extname(file.relativePath).toLowerCase();
      if (!BINARY_EXTENSIONS.has(ext) && !isProbablyBinary(file)) continue;

      const inBuildDir = BUILD_DIR_PATTERN.test(file.relativePath);
      const inUnusualDir = UNUSUAL_DIR_PATTERN.test(file.relativePath);
      const hidden = /(^|\/)\./.test(file.relativePath);
      const packaged = [".jar", ".apk", ".class", ".pyc"].includes(ext);
      const executable = [".exe", ".dll", ".so", ".bin"].includes(ext);

      const severity = inUnusualDir || hidden ? "high" : inBuildDir ? "low" : executable ? "high" : "medium";
      const ruleId = executable
        ? inUnusualDir || hidden
          ? "artifact.executable.unusual-location"
          : "artifact.executable.package"
        : packaged
          ? inUnusualDir || hidden
            ? "artifact.packaged.embedded-source"
            : "artifact.packaged.repository-binary"
          : "artifact.binary.payload-candidate";
      const title = executable
        ? inUnusualDir || hidden
          ? "Executable package in unusual location"
          : "Binary executable artifact in repository"
        : packaged
          ? inUnusualDir || hidden
            ? "Embedded packaged artifact in source tree"
            : "Binary artifact committed to source repository"
          : "Suspicious binary payload candidate";
      const rationale = inBuildDir
        ? "File nhị phân nằm trong thư mục build hoặc cache hợp lệ hơn, nên có thể chỉ là artifact đầu ra hoặc dependency nội bộ."
        : inUnusualDir || hidden
          ? "File nhị phân hoặc packaged artifact xuất hiện lẫn trong source tree/hidden path. Đây không phải vị trí kỳ vọng cho executable hoặc dependency đóng gói sẵn."
          : executable
            ? "Executable hoặc thư viện nhị phân được commit trực tiếp vào repository. Điều này làm giảm khả năng review nguồn gốc và có thể che giấu payload khó kiểm tra."
            : "Artifact nhị phân được đóng gói sẵn trong repository thay vì sinh ra từ quy trình build minh bạch. Cần xác minh đây là dependency hợp lệ hay payload nhúng.";

      findings.push(createFinding({
        ruleId,
        title,
        summary: `Phát hiện artifact nhị phân ${ext || "không rõ phần mở rộng"} trong repository.`,
        description: "A binary or packaged artifact was committed into the repository.",
        rationale,
        recommendation: inBuildDir
          ? "Xác minh artifact này thực sự là output build/cache hợp lệ. Nếu không cần commit, cân nhắc loại khỏi repository và tạo lại từ pipeline build."
          : "Kiểm tra nguồn gốc file, xác nhận file có nên nằm trong repo hay không, và ưu tiên build artifact hoặc dependency được tái tạo minh bạch hơn.",
        falsePositiveNote: inBuildDir
          ? "Artifact nằm trong build/cache/libs nên có thể hợp lệ, đặc biệt với repo phân phối binary mẫu hoặc fixture build."
          : "Một số project có thể commit dependency binary hoặc SDK mẫu. Hãy kiểm tra tài liệu dự án và vị trí lưu trữ kỳ vọng trước khi kết luận là độc hại.",
        severity,
        confidence: inUnusualDir || hidden ? 0.88 : inBuildDir ? 0.38 : executable ? 0.82 : 0.7,
        category: "artifact",
        filePath: file.relativePath,
        detector: "binaryArtifactDetector",
        evidenceSnippet: `${file.relativePath} (${file.size} bytes)`,
        tags: ["binary", executable ? "executable" : "packaged-artifact", inBuildDir ? "build-dir" : "source-tree"],
        evidence: [
          createEvidence("Artifact path", file.relativePath, "path"),
          createEvidence("Artifact size", String(file.size), "metadata"),
          createEvidence("Artifact extension", ext || "(none)", "metadata")
        ]
      }));
    }

    return findings;
  }
};
