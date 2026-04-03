import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { compactValue, createEvidence, createFinding, lineNumberFromIndex, normalizeConfidence } from "./common.js";

const BASE64_TOKEN = /(?:[A-Za-z0-9+/]{120,}={0,2})/g;
const HEX_TOKEN = /(?:0x)?(?:[A-Fa-f0-9]{96,})/g;
const HIGH_ENTROPY_TOKEN = /[A-Za-z0-9+/=_-]{80,}/g;
const MULTI_STAGE_PATTERN = /(fromCharCode|atob\(|Buffer\.from\([^\n)]*base64|eval\(|new Function\(|-EncodedCommand|decodeURIComponent\()/i;
const SUSPICIOUS_DECODED_TEXT = /(powershell|cmd\.exe|curl\s+|wget\s+|Invoke-WebRequest|http[s]?:\/\/|-----BEGIN|secret|token|password|exec\()/i;

export const encodedPayloadDetector: Detector = {
  name: "encodedPayloadDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) continue;

      const content = file.content;
      const claimedRanges = new Set<string>();
      let match: RegExpExecArray | null;

      while ((match = HEX_TOKEN.exec(content)) !== null) {
        const candidate = match[0];
        if (!candidate || !isStrongHexCandidate(candidate)) continue;
        const rangeKey = `${match.index}:${match.index + candidate.length}`;
        claimedRanges.add(rangeKey);
        const lineNumber = lineNumberFromIndex(content, match.index);
        const line = content.split(/\r?\n/)[lineNumber - 1] ?? candidate;
        const multiStage = MULTI_STAGE_PATTERN.test(line);
        findings.push(createFinding({
          ruleId: multiStage ? "encoded.hex.multi-stage" : "encoded.hex.long-sequence",
          title: multiStage ? "Hex blob used with decode or execution primitive" : "Long hexadecimal blob detected",
          summary: "File chứa chuỗi hex dài bất thường, có thể là blob nhị phân hoặc payload được nhúng trong text file.",
          description: "A long hex-encoded blob was found in text content.",
          rationale: multiStage
            ? "Chuỗi hex dài xuất hiện cùng primitive decode/execution, đây là mẫu đáng nghi hơn so với fixture text thông thường."
            : "Chuỗi hex dài liên tục thường xuất hiện khi nhúng shellcode, dữ liệu nhị phân, hoặc payload được encode để né kiểm tra bề mặt.",
          recommendation: "Xác minh nguồn gốc blob hex này; nếu là fixture/test asset hợp lệ thì hãy annotate rõ, nếu không hãy chuyển sang artifact minh bạch hơn hoặc loại bỏ.",
          falsePositiveNote: looksLikeBenignAssetPath(file.relativePath) ? "File trong thư mục test/fixtures/assets có thể chứa blob hợp lệ, nhưng vẫn nên kiểm tra mục đích sử dụng." : undefined,
          severity: multiStage ? "high" : "medium",
          confidence: multiStage ? 0.86 : 0.74,
          category: "encoded-content",
          filePath: file.relativePath,
          lineNumber,
          detector: "encodedPayloadDetector",
          evidenceSnippet: compactValue(line),
          tags: ["encoded", "hex"],
          evidence: [
            createEvidence("Encoded type", "hex", "metadata"),
            createEvidence("Matched snippet", compactValue(line))
          ]
        }));
      }

      while ((match = BASE64_TOKEN.exec(content)) !== null) {
        const candidate = match[0];
        if (!candidate || !isStrictBase64Candidate(candidate) || looksMostlyHex(candidate)) continue;
        const rangeKey = `${match.index}:${match.index + candidate.length}`;
        if (claimedRanges.has(rangeKey)) continue;
        const decoded = decodeBase64(candidate);
        if (!decoded) continue;
        const lineNumber = lineNumberFromIndex(content, match.index);
        const line = content.split(/\r?\n/)[lineNumber - 1] ?? candidate;
        const multiStage = MULTI_STAGE_PATTERN.test(line) || MULTI_STAGE_PATTERN.test(content);
        const decodedSuspicious = Boolean(decoded.text && SUSPICIOUS_DECODED_TEXT.test(decoded.text));
        const severity = decodedSuspicious || multiStage ? "high" : "medium";
        const confidence = normalizeConfidence(0.58 + (decoded.printable ? 0.1 : 0) + (decodedSuspicious ? 0.16 : 0) + (multiStage ? 0.1 : 0));
        findings.push(createFinding({
          ruleId: decodedSuspicious ? "encoded.base64.decoded-sensitive" : multiStage ? "encoded.base64.multi-stage" : "encoded.base64.long-sequence",
          title: decodedSuspicious ? "Base64 content decodes to sensitive text" : "Suspicious long base64 sequence detected",
          summary: decodedSuspicious
            ? "Chuỗi base64 dài có thể decode ra nội dung chứa từ khóa nhạy cảm hoặc hành vi thực thi."
            : "File chứa chuỗi base64 dài bất thường, có thể được dùng để giấu payload hoặc dữ liệu nhạy cảm trong text file.",
          description: "A suspicious base64 sequence was found in file content.",
          rationale: decodedSuspicious
            ? "Chuỗi base64 giải mã ra text có nghĩa và chứa chỉ dấu như command execution, private key, URL tải từ xa, hoặc secret."
            : multiStage
              ? "Chuỗi base64 dài xuất hiện cùng primitive decode/dynamic execution, đây là mẫu thường gặp ở loader hoặc script được obfuscate."
              : "Chuỗi base64 hợp lệ rất dài xuất hiện trong file text và giải mã được theo cách hợp lý, vượt quá ngưỡng dữ liệu cấu hình thông thường.",
          recommendation: decodedSuspicious
            ? "Giải mã và rà soát phần nội dung này ngay, xác minh xem nó có phải payload, script tải từ xa, hoặc secret bị giấu hay không."
            : "Xác minh blob base64 này có phải fixture/asset hợp lệ không; nếu hợp lệ hãy annotate rõ, nếu không nên loại bỏ hoặc chuyển sang định dạng minh bạch hơn.",
          falsePositiveNote: looksLikeBenignAssetPath(file.relativePath)
            ? "Nếu đây là asset embed hợp lệ hoặc fixture test, có thể chỉ cần ghi chú lại vị trí và giảm độ ưu tiên xử lý."
            : undefined,
          severity,
          confidence,
          category: "encoded-content",
          filePath: file.relativePath,
          lineNumber,
          detector: "encodedPayloadDetector",
          evidenceSnippet: compactValue(line),
          tags: ["encoded", "base64", decodedSuspicious ? "decoded-sensitive" : "long-sequence"],
          evidence: [
            createEvidence("Encoded type", "base64", "metadata"),
            createEvidence("Matched snippet", compactValue(line)),
            createEvidence("Decode status", decoded.printable ? "Decoded to readable text" : "Decoded output looked opaque", "metadata"),
            ...(decoded.text ? [createEvidence("Decoded preview", compactValue(decoded.text, 180), "decoded")] : [])
          ]
        }));
      }

      const entropySignals = collectHighEntropySignals(content);
      for (const signal of entropySignals) {
        if (findings.some((finding) => finding.filePath === file.relativePath && finding.lineNumber === signal.lineNumber && compactValue(finding.evidenceSnippet ?? "", 120) === compactValue(signal.line, 120))) {
          continue;
        }
        findings.push(createFinding({
          ruleId: signal.multiStage ? "encoded.unknown-blob.multi-stage" : "encoded.unknown-blob.high-entropy",
          title: signal.multiStage ? "High-entropy blob used with decode or execution primitive" : "High-entropy encoded blob candidate detected",
          summary: signal.multiStage
            ? "Chuỗi entropy cao xuất hiện cùng primitive giải mã hoặc thực thi động."
            : "File chứa chuỗi entropy cao bất thường, giống blob được encode hoặc obfuscate.",
          description: "A high-entropy blob was found in text content.",
          rationale: signal.multiStage
            ? "Entropy cao kết hợp với primitive decode/execution là tín hiệu mạnh cho obfuscation hoặc staged payload."
            : "Chuỗi entropy cao dài bất thường trong file text thường là dữ liệu encode, token, hoặc blob nhúng khó đọc bằng mắt thường.",
          recommendation: "Rà soát ngữ cảnh sử dụng của blob này và xác minh nó có phải fixture/token hợp lệ hay payload bị che giấu hay không.",
          falsePositiveNote: "Một số khóa test, fixture, hoặc hash hợp lệ cũng có entropy cao. Kiểm tra ngữ cảnh khai báo trước khi kết luận.",
          severity: signal.multiStage ? "high" : "medium",
          confidence: signal.multiStage ? 0.82 : 0.62,
          category: "encoded-content",
          filePath: file.relativePath,
          lineNumber: signal.lineNumber,
          detector: "encodedPayloadDetector",
          evidenceSnippet: compactValue(signal.line),
          tags: ["encoded", "high-entropy"],
          evidence: [
            createEvidence("Encoded type", signal.multiStage ? "unknown encoded blob (multi-stage)" : "unknown encoded blob", "metadata"),
            createEvidence("Matched snippet", compactValue(signal.line))
          ]
        }));
      }
    }

    return dedupeEncodedFindings(findings);
  }
};

function decodeBase64(value: string) {
  try {
    if (value.length % 4 !== 0) return undefined;
    const buffer = Buffer.from(value, "base64");
    if (!buffer.length) return undefined;
    const decoded = buffer.toString("utf8");
    const printable = printableRatio(decoded) >= 0.85;
    if (!printable && decoded.length < 40) return undefined;
    return {
      text: decoded.slice(0, 600),
      printable
    };
  } catch {
    return undefined;
  }
}

function printableRatio(value: string) {
  const printable = value.split("").filter((char) => {
    const code = char.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
  }).length;
  return printable / Math.max(value.length, 1);
}

function isStrictBase64Candidate(value: string) {
  return value.length >= 120 && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function looksMostlyHex(value: string) {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return normalized.length >= 96 && /^[A-Fa-f0-9]+$/.test(normalized);
}

function isStrongHexCandidate(value: string) {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return normalized.length >= 96 && normalized.length % 2 === 0 && /^[A-Fa-f0-9]+$/.test(normalized);
}

function looksLikeBenignAssetPath(filePath: string) {
  return /(^|\/)(test|tests|fixtures|fixture|assets|images|docs)(\/|$)/i.test(filePath);
}

function collectHighEntropySignals(content: string) {
  const lines = content.split(/\r?\n/);
  return lines.flatMap((line, index) => {
    const candidates = [...line.matchAll(HIGH_ENTROPY_TOKEN)].map((match) => match[0]).filter(Boolean);
    return candidates
      .filter((candidate) => candidate.length >= 80 && shannonEntropy(candidate) >= 4.6 && !looksMostlyHex(candidate) && !isStrictBase64Candidate(candidate))
      .slice(0, 1)
      .map(() => ({
        line,
        lineNumber: index + 1,
        multiStage: MULTI_STAGE_PATTERN.test(line)
      }));
  }).slice(0, 8);
}

function shannonEntropy(value: string) {
  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function dedupeEncodedFindings(findings: Finding[]) {
  const ranked = [...findings].sort((a, b) => {
    if (b.scoreContribution !== a.scoreContribution) return b.scoreContribution - a.scoreContribution;
    return b.confidence - a.confidence;
  });
  const seen = new Set<string>();
  return ranked.filter((finding) => {
    const evidence = compactValue(finding.evidenceSnippet ?? "", 120);
    const key = [finding.filePath, finding.lineNumber ?? 0, evidence, "encoded-family"].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
