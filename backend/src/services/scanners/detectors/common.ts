import type { Finding, FindingCategory, FindingEvidence, Severity } from "../../../../../shared/src/index.js";
import { createId } from "../../../utils/id.js";
import { normalizeConfidenceValue } from "../../../utils/confidence.js";
import { normalizeFindingCategory } from "../finding-classifier.js";

interface CreateFindingInput {
  ruleId: string;
  title: string;
  description?: string;
  summary: string;
  rationale: string;
  recommendation?: string;
  falsePositiveNote?: string;
  severity: Severity;
  confidence?: number;
  category?: FindingCategory | string;
  scoreContribution?: number;
  filePath: string;
  lineNumber?: number;
  relatedLineNumbers?: number[];
  matchCount?: number;
  detector: string;
  evidenceSnippet?: string;
  tags?: string[];
  evidence?: FindingEvidence[];
  aiTriage?: Finding["aiTriage"];
}

export function createFinding(input: CreateFindingInput): Finding {
  const confidence = normalizeConfidence(input.confidence ?? defaultConfidence(input.severity));
  const category = normalizeFindingCategory({
    ruleId: input.ruleId,
    title: input.title,
    category: input.category ?? "",
    detector: input.detector,
    filePath: input.filePath
  });
  const recommendation = input.recommendation ?? defaultRecommendation(category, input.severity);
  const description = input.description ?? input.summary;

  return {
    id: createId("finding"),
    ruleId: input.ruleId,
    title: input.title,
    description,
    summary: input.summary,
    rationale: input.rationale,
    recommendation,
    falsePositiveNote: input.falsePositiveNote,
    severity: input.severity,
    confidence,
    category,
    scoreContribution: input.scoreContribution ?? defaultScore(input.severity, confidence),
    filePath: input.filePath,
    lineNumber: input.lineNumber,
    relatedLineNumbers: input.relatedLineNumbers,
    matchCount: input.matchCount,
    detector: input.detector,
    evidenceSnippet: input.evidenceSnippet,
    tags: input.tags ?? [],
    evidence: input.evidence ?? [],
    aiTriage: input.aiTriage
  } satisfies Finding;
}

export function createEvidence(label: string, value: string, kind: FindingEvidence["kind"] = "snippet"): FindingEvidence {
  return { label, value, kind };
}

export function findLineNumber(content: string, pattern: RegExp) {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    pattern.lastIndex = 0;
    return pattern.test(line);
  });
  return index >= 0 ? index + 1 : undefined;
}

export function lineNumberFromIndex(content: string, index: number) {
  return content.slice(0, index).split(/\r?\n/).length;
}

export function snippetForLine(content: string, lineNumber?: number, maxLength = 240) {
  if (!lineNumber) {
    return content.slice(0, maxLength);
  }
  const lines = content.split(/\r?\n/);
  return lines[Math.max(0, lineNumber - 1)]?.slice(0, maxLength) ?? "";
}

export function compactValue(value: string, maxLength = 180) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeConfidence(value: unknown, fallback = 0) {
  return normalizeConfidenceValue(value, fallback);
}

function defaultScore(severity: Severity, confidence: number) {
  const base = (() => {
    switch (severity) {
      case "critical":
        return 55;
      case "high":
        return 32;
      case "medium":
        return 18;
      case "low":
      default:
        return 8;
    }
  })();

  return Math.max(4, Math.round(base * (0.65 + confidence * 0.5)));
}

function defaultConfidence(severity: Severity) {
  switch (severity) {
    case "critical":
      return 0.95;
    case "high":
      return 0.87;
    case "medium":
      return 0.72;
    case "low":
    default:
      return 0.58;
  }
}

function defaultRecommendation(category: FindingCategory | string, severity: Severity) {
  switch (category) {
    case "execution":
      return "Tránh dùng exec/shell spawn nếu không thật sự cần, xác thực đầu vào, và dùng API/library an toàn hơn khi có thể.";
    case "secret":
    case "key-material":
      return "Rotate secret hoặc key nếu còn hiệu lực, xóa khỏi repository, và chuyển sang secret manager hoặc env injection.";
    case "encoded-content":
      return "Xác minh mục đích blob được encode, ghi chú rõ nếu là fixture/test asset, và tránh giấu payload trong text file nếu không cần.";
    case "artifact":
      return "Kiểm tra nguồn gốc file nhị phân, xác nhận nó có nên nằm trong repo hay không, và chuyển sang build artifact nếu phù hợp.";
    case "workflow":
      return "Rà soát trigger, quyền token, và command CI để giảm remote execution hoặc secret exposure không cần thiết.";
    case "dependency":
      return "Xác minh hook/phụ thuộc này có thật sự cần thiết, và ưu tiên quy trình build minh bạch thay cho script tự chạy.";
    case "config-risk":
      return "Chuẩn hóa file cấu hình theo dạng template an toàn và chỉ giữ lại giá trị không nhạy cảm trong repository.";
    case "filename-risk":
      return "Xem lại nội dung thật của file và chỉ coi tên file là tín hiệu phụ, không phải bằng chứng cuối cùng.";
    default:
      switch (severity) {
        case "critical":
          return "Cô lập file hoặc artifact này ngay, xác minh nguồn gốc, và loại bỏ khỏi repository nếu không thật sự cần thiết.";
        case "high":
          return "Xem xét kỹ thủ công, xác minh ngữ cảnh sử dụng, và hạn chế chạy hoặc phân phối phần nội dung này trước khi kết luận an toàn.";
        case "medium":
          return "Rà soát ngữ cảnh sử dụng và chuẩn hóa lại nội dung hoặc vị trí lưu trữ nếu đây là dữ liệu hợp lệ.";
        case "low":
        default:
          return "Theo dõi và xác minh xem đây có phải artifact hoặc mẫu nội bộ hợp lệ hay không.";
      }
  }
}
