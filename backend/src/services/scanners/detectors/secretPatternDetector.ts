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

interface PlaceholderAggregate {
  lines: number[];
  labels: string[];
  samples: string[];
}

const SECRET_RULES: SecretRule[] = [
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
    pattern: /AWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?([A-Za-z0-9\/=+]{32,64})/gi,
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

const PLACEHOLDER_PATTERN = /(<replace_me>|your[_-]?(key|token|secret|password)_?here|change[_-]?me|example|sample|dummy|test|placeholder|notasecret|replace[_-]?with|xxxx+)/i;
const DOC_PATH = /(^|\/)(docs?|guides?|notes?)(\/|$)/i;
const TEMPLATE_PATH = /(^|\/)(config\/templates|templates|examples?|samples?)(\/|$)|\.env\.example$|\.template\./i;
const LOW_SIGNAL_DOC_CONTENT = /(password reset|flow|guide|documentation|notes?|runbook|how to|steps?)/i;

export const secretPatternDetector: Detector = {
  name: "secretPatternDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) continue;

      const placeholderAggregate: PlaceholderAggregate = {
        lines: [],
        labels: [],
        samples: []
      };
      const isTemplateFile = TEMPLATE_PATH.test(file.relativePath);
      const isDocLike = DOC_PATH.test(file.relativePath);

      for (const rule of SECRET_RULES) {
        const pattern = new RegExp(rule.pattern);
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(file.content)) !== null) {
          const matchedText = match[0] ?? "";
          const secretValue = match[2] ?? match[1] ?? matchedText;
          const lineNumber = lineNumberFromIndex(file.content, match.index);
          const line = file.content.split(/\r?\n/)[lineNumber - 1] ?? matchedText;
          const placeholder = looksLikePlaceholder(secretValue) || looksLikePlaceholder(line);

          if (placeholder || isTemplateFile) {
            addPlaceholderSignal(placeholderAggregate, lineNumber, match[1] ?? rule.type, line);
            continue;
          }

          if (isDocLike && LOW_SIGNAL_DOC_CONTENT.test(file.content) && !looksRealSecret(secretValue)) {
            continue;
          }

          findings.push(createFinding({
            ruleId: rule.ruleId,
            title: rule.title,
            summary: `Phát hiện ${rule.type.toLowerCase()} được hardcode trực tiếp trong nội dung file.`,
            description: `Potential ${rule.type.toLowerCase()} was embedded directly in file content.`,
            rationale: `${rule.type} xuất hiện trực tiếp trong file text. Loại dữ liệu này thường không nên commit vào repository vì có thể bị lộ thông tin xác thực hoặc quyền truy cập.`,
            recommendation: "Rotate secret nếu đang còn hiệu lực, xóa khỏi repository, và chuyển sang secret manager hoặc env injection thay vì hardcode.",
            severity: rule.severity,
            confidence: rule.confidence,
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
          }));
        }
      }

      if (placeholderAggregate.lines.length > 0) {
        const uniqueLines = [...new Set(placeholderAggregate.lines)].sort((a, b) => a - b);
        const preview = placeholderAggregate.samples.slice(0, 3).map((sample) => compactValue(sample)).join("\n");
        findings.push(createFinding({
          ruleId: "secret.template.placeholder",
          title: "Secret-like placeholders found in template content",
          summary: `File chứa ${uniqueLines.length} placeholder giống secret nhưng nhiều khả năng chỉ là template hoặc dữ liệu mẫu.`,
          description: "Template or example content includes secret-like placeholders rather than live credentials.",
          rationale: isTemplateFile
            ? "File nằm trong template/example path và chứa nhiều biến giống secret với giá trị placeholder, nên đây có khả năng cao là file mẫu chứ không phải secret thật."
            : "Nội dung khớp với biến secret nhưng giá trị đều là placeholder như <replace_me> hoặc your_key_here, nên tín hiệu này nên được hạ mức thay vì coi là rò rỉ thực sự.",
          recommendation: "Giữ placeholder rõ nghĩa, không commit secret thật vào file mẫu, và ưu tiên secret manager hoặc env injection cho môi trường runtime.",
          falsePositiveNote: "Likely template or placeholder, not a real secret.",
          severity: "low",
          confidence: 0.26,
          category: "secret",
          filePath: file.relativePath,
          lineNumber: uniqueLines[0],
          relatedLineNumbers: uniqueLines,
          matchCount: uniqueLines.length,
          detector: "secretPatternDetector",
          evidenceSnippet: preview || placeholderAggregate.samples[0],
          tags: ["secret", "template", "placeholder"],
          evidence: [
            createEvidence("Placeholder count", String(uniqueLines.length), "metadata"),
            createEvidence("Variables", [...new Set(placeholderAggregate.labels)].join(", "), "metadata"),
            createEvidence("Lines", uniqueLines.join(", "), "metadata"),
            ...placeholderAggregate.samples.slice(0, 3).map((sample, index) => createEvidence(index === 0 ? "Sample" : `Sample ${index + 1}`, compactValue(sample)))
          ]
        }));
      }
    }

    return dedupeFindings(findings);
  }
};

function addPlaceholderSignal(target: PlaceholderAggregate, lineNumber: number, label: string, line: string) {
  target.lines.push(lineNumber);
  target.labels.push(String(label));
  target.samples.push(line);
}

function looksLikePlaceholder(value: string) {
  return PLACEHOLDER_PATTERN.test(value) || /^([*xX_\-.]|123456|password)$/i.test(value.trim());
}

function looksRealSecret(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 12 && !looksLikePlaceholder(trimmed);
}

function maskSecret(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "[redacted]";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function dedupeFindings(findings: Finding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [finding.ruleId, finding.filePath, finding.lineNumber ?? 0, finding.evidenceSnippet].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
