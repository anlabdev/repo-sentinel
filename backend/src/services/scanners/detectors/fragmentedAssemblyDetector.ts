import path from "node:path";
import type { Finding, FindingCategory, Severity } from "../../../../../shared/src/index.js";
import type { FileRecord } from "../../../utils/file-system.js";
import type { Detector } from "../types.js";
import { createEvidence, createFinding, snippetForLine } from "./common.js";
import { getBehaviorProfile, hasPattern } from "./languageProfiles.js";

const TEST_HINT = /(^|\/)(tests?|fixtures|samples|examples?|docs)(\/|$)/i;
const BASE64_STRICT = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const HEX_STRICT = /^(?:0x)?[A-Fa-f0-9]{96,}$/;
const SUSPICIOUS_TEXT = /(powershell|cmd\.exe|curl\s+|wget\s+|Invoke-WebRequest|https?:\/\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+|sk-proj-|AKIA[0-9A-Z]{16}|eval\(|exec\(|Start-Process|child_process|Runtime\.getRuntime|ProcessBuilder)/i;
const JS_READ = /readFileSync\(\s*["'`]([^"'`]+)["'`]/gi;
const PY_OPEN = /(?:open|Path)\(\s*["'`]([^"'`]+)["'`][^\n]*\)(?:\.read(?:_text|_bytes)?\(|\s*\.read\()/gi;
const SHELL_CAT = /\bcat\s+([^\n|;&]+)/gi;
const ASSEMBLY_HINT = /(concat\(|join\(|\+\s*(?:\w+\.)?readFileSync|\+\s*(?:\w+\.)?open\(|Buffer\.concat|cat\s+[^\n]+\s+[^\n]+)/i;

interface FragmentRef {
  path: string;
  sourceLine?: number;
}

interface AssemblyClassification {
  ruleId: string;
  title: string;
  summary: string;
  rationale: string;
  recommendation: string;
  severity: Severity;
  confidence: number;
  category: FindingCategory;
  tag: string;
  preview: string;
  previewKind: "snippet" | "decoded";
  assemblyType: string;
}

export const fragmentedAssemblyDetector: Detector = {
  name: "fragmentedAssemblyDetector",
  detect({ files }) {
    const findings: Finding[] = [];
    const byPath = new Map(files.map((file) => [file.relativePath, file]));

    for (const file of files) {
      if (!file.content) continue;
      const profile = getBehaviorProfile(file.relativePath, file.content);
      if (!profile) continue;

      const refs = collectFragmentRefs(file, byPath, profile.language);
      if (refs.length < 2) continue;
      if (profile.language !== "shell" && !ASSEMBLY_HINT.test(file.content)) continue;

      const referencedFiles = refs
        .map((ref) => ({ ref, file: byPath.get(ref.path) }))
        .filter((item): item is { ref: FragmentRef; file: FileRecord } => Boolean(item.file?.content))
        .slice(0, 6);
      if (referencedFiles.length < 2) continue;

      const assembledRaw = referencedFiles.map((item) => item.file.content ?? "").join("");
      const assembledCompact = referencedFiles.map((item) => (item.file.content ?? "").replace(/\s+/g, "")).join("");
      const classification = classifyAssembledContent(assembledRaw, assembledCompact, file, profile.language);
      if (!classification) continue;

      const primaryLine = refs.find((ref) => typeof ref.sourceLine === "number")?.sourceLine;
      const relatedLineNumbers = [...new Set(refs.map((ref) => ref.sourceLine).filter((value): value is number => typeof value === "number"))];
      const evidence = [
        createEvidence("Loader language", profile.language, "metadata"),
        createEvidence("Fragment files", referencedFiles.map((item) => item.ref.path).join(" | "), "path"),
        createEvidence("Assembly type", classification.assemblyType, "metadata"),
        createEvidence("Assembled preview", compactPreview(classification.preview), classification.previewKind)
      ];

      findings.push(createFinding({
        ruleId: classification.ruleId,
        title: classification.title,
        summary: classification.summary,
        description: classification.summary,
        rationale: classification.rationale,
        recommendation: classification.recommendation,
        falsePositiveNote: TEST_HINT.test(file.relativePath) || referencedFiles.some((item) => TEST_HINT.test(item.ref.path))
          ? "Chuỗi ghép nhiều mảnh trong test/fixture/docs có thể là mẫu dữ liệu hợp lệ. Hãy xác minh đây là dữ liệu giả hoặc asset kiểm thử trước khi kết luận độc hại."
          : undefined,
        severity: classification.severity,
        confidence: classification.confidence,
        category: classification.category,
        filePath: file.relativePath,
        lineNumber: primaryLine,
        relatedLineNumbers,
        matchCount: referencedFiles.length,
        detector: "fragmentedAssemblyDetector",
        evidenceSnippet: primaryLine ? snippetForLine(file.content, primaryLine) : compactPreview(classification.preview),
        tags: ["cross-file", "fragmented-assembly", classification.tag, profile.language],
        evidence
      }));
    }

    return findings;
  }
};

function collectFragmentRefs(file: FileRecord, byPath: Map<string, FileRecord>, language: string) {
  const refs: FragmentRef[] = [];
  if (!file.content) return refs;

  if (language === "javascript") {
    refs.push(...collectMatches(file.content, JS_READ, file.relativePath, byPath));
  } else if (language === "python") {
    refs.push(...collectMatches(file.content, PY_OPEN, file.relativePath, byPath));
  } else if (language === "shell") {
    for (const match of file.content.matchAll(SHELL_CAT)) {
      const args = (match[1] ?? "").split(/\s+/).map((part) => part.trim()).filter(Boolean);
      const sourceLine = lineNumberAtIndex(file.content, match.index ?? 0);
      for (const arg of args) {
        const resolved = resolveLocalPath(file.relativePath, arg, byPath);
        if (resolved) refs.push({ path: resolved, sourceLine });
      }
    }
  }

  return dedupeRefs(refs);
}

function collectMatches(content: string, pattern: RegExp, sourcePath: string, byPath: Map<string, FileRecord>) {
  const refs: FragmentRef[] = [];
  for (const match of content.matchAll(pattern)) {
    const rawTarget = (match[1] ?? "").trim();
    const resolved = resolveLocalPath(sourcePath, rawTarget, byPath);
    if (!resolved) continue;
    refs.push({ path: resolved, sourceLine: lineNumberAtIndex(content, match.index ?? 0) });
  }
  return refs;
}

function resolveLocalPath(sourcePath: string, rawTarget: string, byPath: Map<string, FileRecord>) {
  if (!rawTarget || /^https?:\/\//i.test(rawTarget) || rawTarget.startsWith("$") || rawTarget.includes("${")) return undefined;
  const cleaned = rawTarget.replace(/^['"`]|['"`]$/g, "").replaceAll("\\", "/");
  if (!cleaned || cleaned.includes("*") || cleaned.includes("..")) return undefined;
  const baseDir = path.posix.dirname(sourcePath.replaceAll("\\", "/"));
  const candidates = [
    cleaned.replace(/^\.\//, ""),
    path.posix.normalize(path.posix.join(baseDir, cleaned))
  ];

  for (const candidate of candidates) {
    if (byPath.has(candidate)) return candidate;
  }
  return undefined;
}

function classifyAssembledContent(raw: string, compact: string, sourceFile: FileRecord, language: string): AssemblyClassification | undefined {
  const sourceProfile = getBehaviorProfile(sourceFile.relativePath, sourceFile.content ?? "");
  const executeContext = Boolean(sourceProfile && hasPattern(sourceFile.content ?? "", sourceProfile.profile.execute));
  const decodeContext = Boolean(sourceProfile && hasPattern(sourceFile.content ?? "", sourceProfile.profile.decode));
  const preview = compact.slice(0, 220) || raw.slice(0, 220);

  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(raw)) {
    return {
      ruleId: "key-material.fragmented-private-key-assembly",
      title: `Fragmented private key assembly detected (${language})`,
      summary: "File loader đang đọc nhiều mảnh local và ghép thành private key hoặc key material hoàn chỉnh.",
      rationale: "Từng fragment riêng lẻ có thể trông vô hại, nhưng khi ghép theo thứ tự trong code thì tạo thành private key hoàn chỉnh. Đây là kỹ thuật che giấu key material để né review bề mặt.",
      recommendation: "Loại bỏ private key khỏi repository, rotate/revoke nếu key có thể còn hiệu lực, và thay bằng template hoặc secret manager. Đồng thời kiểm tra vì sao loader cần ghép key từ nhiều mảnh file.",
      severity: TEST_HINT.test(sourceFile.relativePath) ? "medium" : "high",
      confidence: TEST_HINT.test(sourceFile.relativePath) ? 0.76 : 0.93,
      category: "key-material",
      tag: "key-material",
      preview,
      previewKind: "decoded",
      assemblyType: "fragmented key material"
    };
  }

  if (HEX_STRICT.test(compact) || (compact.length >= 120 && BASE64_STRICT.test(compact))) {
    const base64Like = compact.length >= 120 && BASE64_STRICT.test(compact);
    return {
      ruleId: base64Like ? "encoded.fragmented-base64-assembly" : "encoded.fragmented-hex-assembly",
      title: `Fragmented encoded payload assembly detected (${language})`,
      summary: "File loader đang ghép nhiều fragment local thành blob encoded hoàn chỉnh mà từng file riêng lẻ khó lộ tín hiệu.",
      rationale: decodeContext || executeContext
        ? "Payload được chia nhỏ ở nhiều file rồi ghép lại trước khi decode hoặc execute. Đây là mô thức che giấu payload/stager phổ biến hơn so với blob encoded nằm nguyên trong một file."
        : "Nhiều file riêng lẻ không đủ dài để bị flag, nhưng khi ghép theo luồng thực thi lại tạo thành blob encoded dài và đáng nghi.",
      recommendation: "Giải mã blob sau khi ghép để kiểm tra nội dung thực, xác minh mục đích các fragment, và thay bằng asset minh bạch hơn nếu đây là dữ liệu hợp lệ.",
      severity: executeContext || decodeContext ? "high" : "medium",
      confidence: executeContext || decodeContext ? 0.89 : 0.77,
      category: "encoded-content",
      tag: base64Like ? "base64" : "hex",
      preview,
      previewKind: "snippet",
      assemblyType: base64Like ? "fragmented base64 blob" : "fragmented hex blob"
    };
  }

  if (SUSPICIOUS_TEXT.test(raw) || SUSPICIOUS_TEXT.test(compact)) {
    return {
      ruleId: "execution.chain.fragmented-payload-assembly",
      title: `Fragmented payload assembly detected (${language})`,
      summary: "File loader đang đọc nhiều file local và ghép chúng thành chuỗi hành vi hoặc payload đáng nghi chỉ lộ ra sau khi hợp nhất.",
      rationale: executeContext
        ? "Từng file fragment có thể trông vô hại, nhưng chuỗi ghép cuối cùng lại chứa chỉ dấu tải từ xa, command execution, hoặc key material. Kết hợp với primitive thực thi trong loader, đây là tín hiệu rất mạnh cho staged payload hoặc hành vi che giấu."
        : "Kết quả ghép nhiều fragment tạo ra chuỗi đáng nghi mà từng phần riêng lẻ không lộ ra, cho thấy khả năng che giấu payload hoặc command string qua nhiều file.",
      recommendation: "Rà soát toàn bộ chuỗi ghép cuối cùng, xác minh nguồn gốc từng fragment, và tránh cơ chế tách nhỏ payload/script vào nhiều file nếu không có lý do kỹ thuật rõ ràng.",
      severity: executeContext ? "critical" : "high",
      confidence: executeContext ? 0.94 : 0.82,
      category: "execution",
      tag: "assembled-payload",
      preview,
      previewKind: "decoded",
      assemblyType: "fragmented suspicious text"
    };
  }

  return undefined;
}

function lineNumberAtIndex(content: string, index: number) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function dedupeRefs(refs: FragmentRef[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.path}:${ref.sourceLine ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactPreview(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}
