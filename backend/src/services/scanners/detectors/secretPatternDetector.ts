import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { compactValue, createEvidence, createFinding, lineNumberFromIndex } from "./common.js";

interface SecretRule {
  ruleId: string;
  title: string;
  type: string;
  pattern: RegExp;
  severity: "medium" | "high" | "critical";
  confidence: number;
}

const SECRET_RULES: SecretRule[] = [
  {
    ruleId: "secret.private-key.block",
    title: "Private key material exposed in file content",
    type: "Private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/gi,
    severity: "critical",
    confidence: 0.99
  },
  {
    ruleId: "secret.env.openai-api-key",
    title: "OpenAI API key exposed in file content",
    type: "OpenAI API key",
    pattern: /(?:OPENAI_API_KEY\s*[:=]\s*["']?|\b)(sk-(?:proj-)?[A-Za-z0-9_-]{20,})/g,
    severity: "high",
    confidence: 0.96
  },
  {
    ruleId: "secret.env.aws-secret-access-key",
    title: "AWS secret access key exposed in file content",
    type: "AWS secret access key",
    pattern: /AWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?([A-Za-z0-9\/+=]{32,64})/gi,
    severity: "high",
    confidence: 0.95
  },
  {
    ruleId: "secret.env.db-password",
    title: "Hardcoded database password detected",
    type: "Database password",
    pattern: /(DB_PASSWORD|DATABASE_PASSWORD|MYSQL_PASSWORD|POSTGRES_PASSWORD|PGPASSWORD)\s*[:=]\s*["']?([^\s"']{6,})/gi,
    severity: "high",
    confidence: 0.9
  },
  {
    ruleId: "secret.env.access-token",
    title: "Access token exposed in file content",
    type: "Access token",
    pattern: /(ACCESS_TOKEN|API_TOKEN|AUTH_TOKEN|SECRET_TOKEN|TOKEN)\s*[:=]\s*["']?([^\s"']{8,})/gi,
    severity: "high",
    confidence: 0.88
  },
  {
    ruleId: "secret.inline.bearer-token",
    title: "Bearer token string embedded in file content",
    type: "Bearer token",
    pattern: /Bearer\s+([A-Za-z0-9._\-]{20,})/gi,
    severity: "high",
    confidence: 0.9
  },
  {
    ruleId: "secret.generic.assignment",
    title: "Generic hardcoded secret assignment detected",
    type: "Generic secret",
    pattern: /\b(API_KEY|SECRET_KEY|CLIENT_SECRET|PASSWORD|PASSWD|JWT_SECRET|WEBHOOK_SECRET)\b\s*[:=]\s*["']?([^\s"']{6,})/gi,
    severity: "medium",
    confidence: 0.76
  }
];

const PLACEHOLDER_PATTERN = /(changeme|change_me|example|sample|dummy|test|placeholder|notasecret|your[_-]?(token|key|secret)|xxxx+)/i;

export const secretPatternDetector: Detector = {
  name: "secretPatternDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) {
        continue;
      }

      for (const rule of SECRET_RULES) {
        const pattern = new RegExp(rule.pattern);
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(file.content)) !== null) {
          const matchedText = match[0] ?? "";
          const secretValue = match[2] ?? match[1] ?? matchedText;
          const lineNumber = lineNumberFromIndex(file.content, match.index);
          const line = file.content.split(/\r?\n/)[lineNumber - 1] ?? matchedText;
          const placeholder = looksLikePlaceholder(secretValue) || looksLikePlaceholder(line);
          const severity = placeholder && rule.severity !== "critical" ? "medium" : rule.severity;
          const confidence = placeholder ? Math.min(rule.confidence, 0.55) : rule.confidence;
          findings.push(
            createFinding({
              ruleId: rule.ruleId,
              title: rule.title,
              summary: `Phát hiện ${rule.type.toLowerCase()} được hardcode trực tiếp trong nội dung file.`,
              description: `Potential ${rule.type.toLowerCase()} was embedded directly in file content.`,
              rationale: placeholder
                ? "Biểu thức khớp với mẫu secret nhưng giá trị trông giống placeholder hoặc dữ liệu demo, nên cần xác minh ngữ cảnh trước khi kết luận là rò rỉ thực sự."
                : `${rule.type} xuất hiện trực tiếp trong file text. Loại dữ liệu này thường không nên commit vào repository vì có thể bị lộ thông tin xác thực hoặc quyền truy cập.`,
              recommendation: placeholder
                ? "Nếu đây là giá trị demo, hãy thay bằng placeholder rõ ràng hơn và tách khỏi file production. Nếu là giá trị thật, hãy chuyển sang secret manager hoặc biến môi trường runtime."
                : "Di chuyển secret ra khỏi repository, rotate thông tin xác thực nếu đang còn hiệu lực, và dùng secret manager hoặc biến môi trường triển khai.",
              falsePositiveNote: placeholder
                ? "Giá trị hiện tại có dấu hiệu là placeholder hoặc dữ liệu mẫu. Vẫn nên kiểm tra vì mẫu placeholder đôi khi bị thay bằng secret thật ở nhánh khác."
                : undefined,
              severity,
              confidence,
              category: "secret",
              filePath: file.relativePath,
              lineNumber,
              detector: "secretPatternDetector",
              evidenceSnippet: compactValue(line),
              tags: ["secret", "credential", rule.type.toLowerCase().replace(/\s+/g, "-")],
              evidence: [
                createEvidence("Secret type", rule.type, "metadata"),
                createEvidence("Matched line", compactValue(line)),
                createEvidence("Matched value preview", maskSecret(secretValue), "snippet")
              ]
            })
          );
        }
      }
    }

    return dedupeFindings(findings);
  }
};

function looksLikePlaceholder(value: string) {
  return PLACEHOLDER_PATTERN.test(value) || /^([*xX_\-.]|123456|password)$/i.test(value.trim());
}

function maskSecret(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return "[redacted]";
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function dedupeFindings(findings: Finding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [finding.ruleId, finding.filePath, finding.lineNumber ?? 0, finding.evidenceSnippet].join("::");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
