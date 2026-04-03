import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, findLineNumber, snippetForLine } from "./common.js";

const FILE_HINT = /(\.(ps1|bat|cmd|sh|py|service|plist|reg|yaml|yml|json|xml|js|ts))$/i;
const PERSISTENCE_PATTERN = /(schtasks\s+\/create|register-scheduledtask|new-itemproperty.+\\run\\|startup\\|@reboot|crontab|launchagents|launchdaemons|systemctl\s+enable|wantedby=multi-user.target|hkcu\\software\\microsoft\\windows\\currentversion\\run|hklm\\software\\microsoft\\windows\\currentversion\\run)/i;
const INSTALL_CONTEXT = /(^|\/)(install|setup|bootstrap|service|deploy|scripts|ops)(\/|$)/i;

export const persistenceBehaviorDetector: Detector = {
  name: "persistenceBehaviorDetector",
  detect({ files }) {
    const findings: Finding[] = [];
    for (const file of files) {
      if (!file.content || !FILE_HINT.test(file.relativePath) || !PERSISTENCE_PATTERN.test(file.content)) continue;
      const lineNumber = findLineNumber(file.content, PERSISTENCE_PATTERN);
      const matchedLine = snippetForLine(file.content, lineNumber);
      const installLike = INSTALL_CONTEXT.test(file.relativePath);
      findings.push(createFinding({
        ruleId: "execution.persistence.autorun-registration",
        title: "Persistence or autorun registration pattern detected",
        summary: "Phát hiện dấu hiệu thiết lập autorun, scheduled task, startup entry, hoặc service enable trong file.",
        description: "Persistence-related commands or startup registration patterns were found in the file.",
        rationale: installLike ? "File nằm trong vùng cài đặt/deploy nên có thể hợp lệ, nhưng vẫn chứa primitive persistence có thể bị lạm dụng để bám trụ sau khi chạy." : "Mẫu lệnh cho thấy file có thể tạo scheduled task, startup entry, autorun registry, hoặc enable service. Đây là hành vi persistence cần review kỹ trong source repository.",
        recommendation: "Xác minh nhu cầu autorun/service thật sự, giới hạn quyền cài đặt, và tránh đăng ký persistence mặc định nếu không có quy trình triển khai minh bạch.",
        falsePositiveNote: installLike ? "Script cài đặt hợp lệ có thể cần tạo service hoặc task. Hãy review trigger, quyền, và quy trình triển khai thực tế." : undefined,
        severity: installLike ? "medium" : "high",
        confidence: installLike ? 0.72 : 0.86,
        category: "execution",
        filePath: file.relativePath,
        lineNumber,
        detector: "persistenceBehaviorDetector",
        evidenceSnippet: matchedLine,
        tags: ["persistence", "autorun", "startup"],
        evidence: [createEvidence("Matched line", matchedLine), createEvidence("Pattern family", "Persistence / autorun", "metadata")]
      }));
    }
    return findings;
  }
};
