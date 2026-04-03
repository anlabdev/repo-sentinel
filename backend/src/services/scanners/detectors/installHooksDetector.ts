import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding } from "./common.js";

const INSTALL_SCRIPTS = ["preinstall", "postinstall", "install", "prepare"];
const SUSPICIOUS_TERMS = /(curl|wget|powershell|Invoke-WebRequest|certutil|bash\s+-c|chmod\s+\+x|node\s+-e)/i;

export const installHooksDetector: Detector = {
  name: "installHooksDetector",
  detect({ files }) {
    const findings: Finding[] = [];
    for (const file of files) {
      if (file.relativePath !== "package.json" || !file.content) {
        continue;
      }

      try {
        const parsed = JSON.parse(file.content) as { scripts?: Record<string, string> };
        for (const [scriptName, scriptValue] of Object.entries(parsed.scripts ?? {})) {
          if (!INSTALL_SCRIPTS.includes(scriptName)) {
            continue;
          }

          const suspicious = SUSPICIOUS_TERMS.test(scriptValue);
          findings.push(
            createFinding({
              ruleId: suspicious ? "install-hook.suspicious-command" : "install-hook.present",
              title: `Install hook present: ${scriptName}`,
              summary: `Lifecycle script ${scriptName} sẽ tự chạy khi cài dependency.`,
              description: "Lifecycle install hooks can execute automatically during dependency installation.",
              rationale: suspicious
                ? "Hook cài đặt tự động chứa command tải từ xa hoặc thực thi shell, đây là mẫu thường được lạm dụng để chạy mã ngoài ý muốn khi người dùng cài dependency."
                : "Lifecycle hook tồn tại trong package.json. Hook dạng này không nhất thiết độc hại nhưng cần được review vì sẽ chạy tự động trong quá trình cài đặt.",
              recommendation: suspicious
                ? "Xác minh command trong hook, loại bỏ hành vi tải/thực thi động nếu không bắt buộc, và cân nhắc chuyển sang bước build minh bạch hơn."
                : "Review mục đích của hook và tài liệu hóa rõ lý do tồn tại nếu nó là hành vi hợp lệ.",
              falsePositiveNote: suspicious ? undefined : "Nhiều package hợp lệ dùng prepare/install để build asset hoặc compile native module. Kiểm tra script thực tế trước khi kết luận có rủi ro.",
              severity: suspicious ? "high" : "medium",
              confidence: suspicious ? 0.88 : 0.64,
              category: "install-hook",
              filePath: file.relativePath,
              detector: "installHooksDetector",
              evidenceSnippet: scriptValue.slice(0, 240),
              tags: ["package.json", "install-hook", "dependency-script"],
              evidence: [
                createEvidence("Lifecycle script", scriptName, "metadata"),
                createEvidence("Script command", scriptValue.slice(0, 240))
              ]
            })
          );
        }
      } catch {
        continue;
      }
    }

    return findings;
  }
};
