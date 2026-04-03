import OpenAI from "openai";
import type { AiExplanation, AiReview, Finding, FindingAiTriage, OpenAiValidationStatus, TokenUsage, UiLanguage } from "../../../../shared/src/index.js";
import type { AppEnv } from "../../config/env.js";
import { buildContextSnippet, type FileRecord } from "../../utils/file-system.js";
import { normalizeConfidenceValue } from "../../utils/confidence.js";

interface ReviewInput {
  repoUrl: string;
  findings: Finding[];
  files: FileRecord[];
  language?: UiLanguage;
}

interface ExplainReportInput {
  repoUrl: string;
  findings: Finding[];
  language: UiLanguage;
  aiReview?: AiReview;
  question?: string;
}

export interface OpenAiRuntimeConfig {
  apiKey?: string;
  model?: string;
}

export interface OpenAiValidationResult {
  model: string;
  validationStatus: OpenAiValidationStatus;
  validationMessage?: string;
  lastValidatedAt?: string;
}

export const AVAILABLE_OPENAI_MODELS = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"] as const;

export class OpenAiReviewService {
  public constructor(private readonly env: AppEnv) {}

  public async validateConfiguration(input: { apiKey?: string; model?: string; language?: UiLanguage }): Promise<OpenAiValidationResult> {
    const language = input.language ?? "vi";
    const model = input.model ?? this.env.openAiModel;
    const apiKey = input.apiKey?.trim();
    if (!apiKey) {
      return {
        model,
        validationStatus: "missing",
        validationMessage: language === "vi" ? "Chưa có OpenAI API key." : "OpenAI API key is missing."
      };
    }

    try {
      const client = new OpenAI({ apiKey });
      await client.models.retrieve(model);
      return {
        model,
        validationStatus: "valid",
        validationMessage: language === "vi" ? "API key hợp lệ và model có thể sử dụng." : "API key is valid and the model is available.",
        lastValidatedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        model,
        validationStatus: "invalid",
        validationMessage: sanitizeOpenAiError(error, language),
        lastValidatedAt: new Date().toISOString()
      };
    }
  }

  public async review(input: ReviewInput, config?: OpenAiRuntimeConfig): Promise<AiReview | undefined> {
    const resolved = this.resolveConfig(config);
    if (!resolved.apiKey) {
      return undefined;
    }

    const language = input.language ?? "vi";
    const client = new OpenAI({ apiKey: resolved.apiKey });
    const topFindings = selectFindingsForAi(input.findings, 6).map((finding) => serializeFindingForAi(finding));

    const prompt = [
      language === "vi"
        ? "Bạn đang review báo cáo security scan của repository. Hãy dùng findings xác định trước làm nguồn sự thật chính; không tự bịa thêm detection mới."
        : "You are reviewing a repository security scan. Treat the deterministic findings as the primary source of truth; do not invent new detections.",
      language === "vi"
        ? "Trả về strict JSON với keys: summary, severity, confidence, recommendedAction, reasoningSummary, falsePositiveNotes, keyFindings, suggestedRules. keyFindings là mảng object gồm ruleId, title, severity, confidence, filePath, summary. Không bọc markdown fences."
        : "Return strict JSON with keys: summary, severity, confidence, recommendedAction, reasoningSummary, falsePositiveNotes, keyFindings, suggestedRules. keyFindings is an array of objects with ruleId, title, severity, confidence, filePath, summary. Do not wrap JSON in markdown fences.",
      `Repository: ${input.repoUrl}`,
      `Deterministic findings: ${JSON.stringify(topFindings)}`
    ].join("\n");

    try {
      const response = await client.responses.create({ model: resolved.model, input: prompt });
      const raw = response.output_text;
      const parsed = parseJsonPayload<{
        summary: string;
        severity: AiReview["severity"];
        confidence: unknown;
        recommendedAction: string;
        reasoningSummary: string;
        falsePositiveNotes?: string[];
        keyFindings?: AiReview["keyFindings"];
        suggestedRules: string[];
      }>(raw);

      const normalizedConfidence = normalizeConfidence(parsed.confidence, inferConfidenceFromSeverity(parsed.severity ?? topFindings[0]?.severity));
      const normalizedKeyFindings = normalizeAiReviewKeyFindings(Array.isArray(parsed.keyFindings) ? parsed.keyFindings : []);
      return {
        model: resolved.model,
        language,
        summary: parsed.summary,
        severity: parsed.severity,
        confidence: normalizedConfidence,
        recommendedAction: parsed.recommendedAction,
        reasoningSummary: parsed.reasoningSummary,
        falsePositiveNotes: Array.isArray(parsed.falsePositiveNotes) ? parsed.falsePositiveNotes : [],
        keyFindings: normalizedKeyFindings,
        suggestedRules: Array.isArray(parsed.suggestedRules) ? parsed.suggestedRules : [],
        rawResponse: stringifyNormalizedPayload({
          ...parsed,
          confidence: normalizedConfidence,
          keyFindings: normalizedKeyFindings
        }, raw),
        tokenUsage: extractTokenUsage(response)
      };
    } catch (error) {
      return {
        model: resolved.model,
        language,
        summary: language === "vi" ? "Không thể hoàn tất AI review một cách sạch sẽ." : "OpenAI review could not be completed cleanly.",
        severity: "medium",
        confidence: 0.4,
        recommendedAction: language === "vi" ? "Tiếp tục dựa trên các phát hiện xác định trước và thử lại AI sau." : "Continue with deterministic findings and retry AI analysis later.",
        reasoningSummary: language === "vi" ? "Bản quét đã hoàn tất nhưng phản hồi AI không thể được phân tích thành định dạng JSON có cấu trúc như hệ thống mong đợi." : "The scan finished, but the AI escalation response could not be parsed into the expected structured format.",
        falsePositiveNotes: [],
        keyFindings: [],
        suggestedRules: [],
        error: sanitizeOpenAiError(error, language)
      };
    }
  }

  public async triageFindings(input: ReviewInput, config?: OpenAiRuntimeConfig): Promise<{ triages: Record<string, FindingAiTriage>; tokenUsage?: TokenUsage }> {
    const resolved = this.resolveConfig(config);
    if (!resolved.apiKey) {
      return { triages: {} };
    }

    const language = input.language ?? "vi";
    const client = new OpenAI({ apiKey: resolved.apiKey });
    const candidates = input.findings
      .filter((finding) => finding.severity === "high" || finding.severity === "critical" || finding.scoreContribution >= 24 || (finding.scoreContribution >= 18 && finding.confidence <= 0.72))
      .slice(0, 5)
      .map((finding) => {
        const file = input.files.find((item) => item.relativePath === finding.filePath);
        return {
          ...serializeFindingForAi(finding),
          context: extractFindingContext(file, finding)
        };
      });

    if (candidates.length === 0) {
      return { triages: {} };
    }

    const prompt = [
      language === "vi"
        ? "Bạn đang rà soát từng phát hiện bảo mật trong repository. Hãy chỉ ra đúng dòng hoặc đoạn text đáng nghi nhất cho mỗi finding."
        : "You are triaging each repository security finding. Point to the most suspicious line or text segment for each finding.",
      language === "vi"
        ? "Trả về strict JSON với dạng { items: [...] }. Mỗi item phải có: findingId, summary, suspiciousLineNumber, suspiciousText, rationale, confidence, recommendedAction, falsePositiveNote. suspiciousLineNumber có thể null. Không bọc markdown fences."
        : "Return strict JSON in the form { items: [...] }. Each item must include: findingId, summary, suspiciousLineNumber, suspiciousText, rationale, confidence, recommendedAction, falsePositiveNote. suspiciousLineNumber may be null. Do not wrap in markdown fences.",
      `Repository: ${input.repoUrl}`,
      `Findings to triage: ${JSON.stringify(candidates)}`
    ].join("\n");

    try {
      const response = await client.responses.create({ model: resolved.model, input: prompt });
      const raw = response.output_text;
      const parsed = parseJsonPayload<{
        items: Array<{
          findingId: string;
          summary: string;
          suspiciousLineNumber?: number | null;
          suspiciousText?: string | null;
          rationale: string;
          confidence: unknown;
          recommendedAction: string;
          falsePositiveNote?: string | null;
        }>;
      }>(raw);

      const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const triageById: Record<string, FindingAiTriage> = {};
      for (const item of parsed.items ?? []) {
        if (!item?.findingId) continue;
        const fallback = candidateMap.get(item.findingId);
        triageById[item.findingId] = {
          summary: item.summary || fallback?.summary || "Finding requires additional review.",
          suspiciousLineNumber: typeof item.suspiciousLineNumber === "number" ? item.suspiciousLineNumber : fallback?.lineNumber,
          suspiciousText: item.suspiciousText?.trim() || fallback?.evidenceSnippet || undefined,
          reasoning: item.rationale || fallback?.rationale || "The finding needs a focused manual review.",
          rationale: item.rationale || fallback?.rationale || "The finding needs a focused manual review.",
          confidence: normalizeConfidence(item.confidence, fallback?.confidence),
          recommendedAction: item.recommendedAction || fallback?.recommendation || "Review this finding manually.",
          falsePositiveNote: item.falsePositiveNote?.trim() || fallback?.falsePositiveNote || undefined
        };
      }
      return { triages: triageById, tokenUsage: extractTokenUsage(response) };
    } catch {
      return { triages: {} };
    }
  }

  public shouldUseRuleBasedFindingExplanation(input: { finding: Finding; question?: string; force?: boolean }) {
    if (input.force || (input.question && input.question.trim())) {
      return false;
    }

    const finding = input.finding;
    return finding.severity === "low" || (finding.severity === "medium" && finding.confidence >= 0.8 && finding.category !== "encoded-content");
  }

  public buildRuleBasedFindingExplanation(input: { finding: Finding; language: UiLanguage }): AiExplanation {
    const finding = input.finding;
    return {
      model: "rule-based",
      language: input.language,
      scope: "finding",
      summary: finding.summary,
      explanation: finding.rationale,
      rationale: finding.rationale,
      falsePositiveNote: finding.falsePositiveNote,
      relatedSnippet: finding.evidenceSnippet,
      confidence: normalizeConfidence(finding.confidence, 0.5),
      recommendedAction: finding.recommendation,
      cacheSource: "rule"
    };
  }

  public async explainFinding(input: { repoUrl: string; finding: Finding; language: UiLanguage; question?: string }, config?: OpenAiRuntimeConfig): Promise<AiExplanation> {
    const resolved = this.resolveConfig(config);
    if (!resolved.apiKey) {
      return this.unavailableExplanation(input.language, "finding", resolved.model);
    }

    const client = new OpenAI({ apiKey: resolved.apiKey });
    const prompt = [
      input.language === "vi"
        ? "Bạn đang giải thích một phát hiện security đã có sẵn cho người dùng cuối. Hãy bám sát finding có cấu trúc và không tự tạo thêm detection mới."
        : "You are explaining an existing security finding to an end user. Stay grounded in the structured finding and do not invent new detections.",
      input.language === "vi"
        ? "Trả về strict JSON với keys: summary, explanation, rationale, confidence, recommendedAction, falsePositiveNote, relatedSnippet. Không bọc markdown fences."
        : "Return strict JSON with keys: summary, explanation, rationale, confidence, recommendedAction, falsePositiveNote, relatedSnippet. Do not wrap JSON in markdown fences.",
      `Repository: ${input.repoUrl}`,
      `Finding: ${JSON.stringify(serializeFindingForAi(input.finding))}`,
      input.question ? `User question: ${input.question}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await client.responses.create({ model: resolved.model, input: prompt });
      const raw = response.output_text;
      const parsed = parseJsonPayload<{
        summary: string;
        explanation: string;
        rationale?: string;
        confidence: unknown;
        recommendedAction: string;
        falsePositiveNote?: string;
        relatedSnippet?: string;
      }>(raw);

      const normalizedConfidence = normalizeConfidence(parsed.confidence, input.finding.confidence);
      return {
        model: resolved.model,
        language: input.language,
        scope: "finding",
        summary: parsed.summary,
        explanation: parsed.explanation,
        rationale: parsed.rationale,
        falsePositiveNote: parsed.falsePositiveNote,
        relatedSnippet: parsed.relatedSnippet,
        confidence: normalizedConfidence,
        recommendedAction: parsed.recommendedAction,
        rawResponse: stringifyNormalizedPayload({ ...parsed, confidence: normalizedConfidence }, raw),
        tokenUsage: extractTokenUsage(response),
        cacheSource: "ai"
      };
    } catch (error) {
      return {
        model: resolved.model,
        language: input.language,
        scope: "finding",
        summary: input.language === "vi" ? "AI chưa giải thích được finding này." : "AI could not explain this finding.",
        explanation:
          input.language === "vi"
            ? "Yêu cầu giải thích nâng cao đã thất bại, nhưng finding gốc vẫn hợp lệ và nên được xem xét thủ công."
            : "The advanced explanation request failed, but the original finding is still valid and should be reviewed manually.",
        rationale: input.finding.rationale,
        falsePositiveNote: input.finding.falsePositiveNote,
        relatedSnippet: input.finding.evidenceSnippet,
        confidence: Math.max(0.3, input.finding.confidence * 0.65),
        recommendedAction: input.language === "vi" ? "Thử lại sau hoặc kiểm tra cấu hình OpenAI." : "Retry later or verify the OpenAI configuration.",
        error: sanitizeOpenAiError(error, input.language)
      };
    }
  }

  public async explainReport(input: ExplainReportInput, config?: OpenAiRuntimeConfig): Promise<AiExplanation> {
    const resolved = this.resolveConfig(config);
    if (!resolved.apiKey) {
      return this.unavailableExplanation(input.language, "report", resolved.model);
    }

    const client = new OpenAI({ apiKey: resolved.apiKey });
    const prompt = [
      input.language === "vi"
        ? "Bạn đang giải thích toàn bộ báo cáo quét repository cho người dùng cuối bằng tiếng Việt rõ ràng, có cấu trúc."
        : "You are explaining the full repository scan report to an end user in clear, structured English.",
      input.language === "vi"
        ? "Trả về strict JSON với keys: summary, explanation, rationale, confidence, recommendedAction, falsePositiveNote, relatedSnippet. explanation nên giải thích bức tranh tổng thể."
        : "Return strict JSON with keys: summary, explanation, rationale, confidence, recommendedAction, falsePositiveNote, relatedSnippet. The explanation should cover the overall picture.",
      `Repository: ${input.repoUrl}`,
      `Top findings: ${JSON.stringify(input.findings.slice(0, 12).map((finding) => serializeFindingForAi(finding)))}`,
      input.aiReview ? `Existing AI review: ${JSON.stringify(input.aiReview)}` : "",
      input.question ? `User question: ${input.question}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await client.responses.create({ model: resolved.model, input: prompt });
      const raw = response.output_text;
      const parsed = parseJsonPayload<{
        summary: string;
        explanation: string;
        rationale?: string;
        confidence: unknown;
        recommendedAction: string;
        falsePositiveNote?: string;
        relatedSnippet?: string;
      }>(raw);

      const normalizedConfidence = normalizeConfidence(parsed.confidence, input.aiReview?.confidence ?? 0.64);
      return {
        model: resolved.model,
        language: input.language,
        scope: "report",
        summary: parsed.summary,
        explanation: parsed.explanation,
        rationale: parsed.rationale,
        falsePositiveNote: parsed.falsePositiveNote,
        relatedSnippet: parsed.relatedSnippet,
        confidence: normalizedConfidence,
        recommendedAction: parsed.recommendedAction,
        rawResponse: stringifyNormalizedPayload({ ...parsed, confidence: normalizedConfidence }, raw),
        tokenUsage: extractTokenUsage(response),
        cacheSource: "ai"
      };
    } catch (error) {
      return {
        model: resolved.model,
        language: input.language,
        scope: "report",
        summary: input.language === "vi" ? "AI chưa giải thích được toàn bộ báo cáo này." : "AI could not explain this report yet.",
        explanation:
          input.language === "vi"
            ? "Yêu cầu giải thích toàn cục đã thất bại. Bạn vẫn có thể dựa vào findings xác định trước và AI review hiện có để tiếp tục phân tích."
            : "The full-report explanation request failed. You can still rely on the deterministic findings and the existing AI review to continue the investigation.",
        confidence: Math.max(0.35, input.aiReview?.confidence ?? 0.5),
        recommendedAction: input.language === "vi" ? "Thử lại sau hoặc đặt câu hỏi cụ thể hơn cho từng finding." : "Retry later or ask a more specific question for an individual finding.",
        error: sanitizeOpenAiError(error, input.language)
      };
    }
  }

  private resolveConfig(config?: OpenAiRuntimeConfig) {
    return {
      apiKey: config?.apiKey?.trim(),
      model: config?.model || this.env.openAiModel
    };
  }

  private unavailableExplanation(language: UiLanguage, scope: "finding" | "report", model: string): AiExplanation {
    const isVi = language === "vi";
    const subject = scope === "report"
      ? (isVi ? "toàn bộ báo cáo" : "the full report")
      : (isVi ? "finding này" : "this finding");

    return {
      model,
      language,
      scope,
      summary: isVi ? "Chưa thể giải thích bằng AI." : "AI explanation is unavailable.",
      explanation: isVi
        ? `OpenAI API key chưa được cấu hình, nên hiện chỉ có thể giải thích ${subject} dựa trên detector xác định trước và dữ liệu cục bộ.`
        : `OpenAI API key is not configured, so ${subject} can only be explained using deterministic detectors and local scan data for now.`,
      confidence: 0.3,
      recommendedAction: isVi ? "Cấu hình OpenAI API key rồi thử lại." : "Configure the OpenAI API key and try again."
    };
  }
}

function serializeFindingForAi(finding: Finding) {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    category: finding.category,
    filePath: finding.filePath,
    lineNumber: finding.lineNumber,
    detector: finding.detector,
    summary: finding.summary,
    rationale: finding.rationale,
    recommendation: finding.recommendation,
    falsePositiveNote: finding.falsePositiveNote,
    evidenceSnippet: finding.evidenceSnippet,
    evidence: finding.evidence
  };
}

function extractFindingContext(file: FileRecord | undefined, finding: Finding) {
  if (!file?.content) {
    return finding.evidenceSnippet ?? "";
  }

  return buildContextSnippet(file.content, finding.lineNumber).slice(0, 1800);
}

function extractTokenUsage(response: { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } } | undefined): TokenUsage | undefined {
  const inputTokens = Number(response?.usage?.input_tokens ?? 0);
  const outputTokens = Number(response?.usage?.output_tokens ?? 0);
  const totalTokens = Number(response?.usage?.total_tokens ?? inputTokens + outputTokens);

  if (!inputTokens && !outputTokens && !totalTokens) {
    return undefined;
  }

  return { inputTokens, outputTokens, totalTokens };
}

function parseJsonPayload<T>(raw: string): T {
  const candidates = [raw.trim()];

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1).trim());
  }

  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(raw.slice(firstBracket, lastBracket + 1).trim());
  }

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown JSON parse error");
    }
  }

  throw new Error(errors[0] ?? "AI response was not valid JSON.");
}

function normalizeConfidence(value: unknown, fallback = 0) {
  return normalizeConfidenceValue(value, fallback);
}

function normalizeAiReviewKeyFindings(items: AiReview["keyFindings"] | undefined) {
  return (items ?? []).map((item) => ({
    ...item,
    confidence: normalizeConfidenceValue(item.confidence, inferConfidenceFromSeverity(item.severity))
  }));
}

function stringifyNormalizedPayload(payload: Record<string, unknown>, fallback: string) {
  try {
    return JSON.stringify(payload);
  } catch {
    return fallback;
  }
}

function inferConfidenceFromSeverity(severity: AiReview["severity"] | undefined) {
  if (severity === "critical") return 0.95;
  if (severity === "high") return 0.85;
  if (severity === "medium") return 0.65;
  return 0.35;
}

function selectFindingsForAi(findings: Finding[], limit: number) {
  return [...findings]
    .filter((finding) => finding.severity === "critical" || finding.severity === "high" || finding.scoreContribution >= 18 || finding.confidence <= 0.72)
    .sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 } as const;
      if (severityOrder[b.severity] !== severityOrder[a.severity]) return severityOrder[b.severity] - severityOrder[a.severity];
      if (b.scoreContribution !== a.scoreContribution) return b.scoreContribution - a.scoreContribution;
      return a.confidence - b.confidence;
    })
    .slice(0, limit);
}

function sanitizeOpenAiError(error: unknown, language: UiLanguage = "en") {
  const message = error instanceof Error ? error.message : "Unknown OpenAI error";
  const looksLikeJsonError = /json|unexpected token|parse/i.test(message);
  const authError = /401|403|incorrect api key|invalid api key|authentication|permission|model.*not found|does not exist|access/i.test(message.toLowerCase());

  if (looksLikeJsonError) {
    return language === "vi"
      ? "Phản hồi từ AI không đúng định dạng JSON mong đợi, nên hệ thống không thể phân tích tự động lần này."
      : "The AI response did not match the expected JSON format, so automatic parsing could not be completed this time.";
  }

  if (authError) {
    return language === "vi"
      ? "OpenAI API key hoặc model không hợp lệ, hoặc tài khoản hiện không có quyền dùng model này."
      : "The OpenAI API key or model is invalid, or this account does not currently have access to that model.";
  }

  return message;
}
