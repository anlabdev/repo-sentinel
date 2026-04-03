import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { compactValue, createEvidence, createFinding, lineNumberFromIndex, normalizeConfidence } from "./common.js";

const BASE64_SEQUENCE = /(?:[A-Za-z0-9+/]{96,}={0,2})/g;
const HEX_SEQUENCE = /(?:0x)?(?:[A-Fa-f0-9]{96,})/g;
const MULTI_STAGE_PATTERN = /(fromCharCode|atob\(|Buffer\.from\([^\n)]*base64|eval\(|new Function\(|-EncodedCommand|decodeURIComponent\()/i;
const SUSPICIOUS_DECODED_TEXT = /(powershell|cmd\.exe|curl\s+|wget\s+|Invoke-WebRequest|http[s]?:\/\/|-----BEGIN|secret|token|password|exec\()/i;

export const encodedPayloadDetector: Detector = {
  name: "encodedPayloadDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) {
        continue;
      }

      const content = file.content;
      let match: RegExpExecArray | null;
      while ((match = BASE64_SEQUENCE.exec(content)) !== null) {
        const candidate = match[0];
        if (!candidate || candidate.length < 96 || looksLikeSafeBase64(candidate)) {
          continue;
        }

        const lineNumber = lineNumberFromIndex(content, match.index);
        const line = content.split(/\r?\n/)[lineNumber - 1] ?? candidate;
        const decoded = decodeBase64(candidate);
        const decodedLooksText = Boolean(decoded?.printable);
        const decodedSuspicious = Boolean(decoded?.text && SUSPICIOUS_DECODED_TEXT.test(decoded.text));
        const multiStage = MULTI_STAGE_PATTERN.test(line) || MULTI_STAGE_PATTERN.test(content);
        const severity = decodedSuspicious || multiStage ? "high" : "medium";
        const confidence = normalizeConfidence((decodedLooksText ? 0.18 : 0) + (decodedSuspicious ? 0.18 : 0) + (multiStage ? 0.14 : 0) + 0.56);

        findings.push(
          createFinding({
            ruleId: decodedSuspicious ? "encoded.base64.decoded-sensitive" : multiStage ? "encoded.base64.multi-stage" : "encoded.base64.long-sequence",
            title: decodedSuspicious ? "Encoded content decodes to sensitive text" : "Suspicious long base64 sequence detected",
            summary: decodedSuspicious
              ? "Chuỗi base64 dài có thể decode ra nội dung chứa từ khóa nhạy cảm hoặc hành vi thực thi."
              : "File chứa chuỗi base64 dài bất thường, có thể được dùng để giấu payload hoặc dữ liệu nhạy cảm trong text file.",
            description: "A suspicious encoded sequence was found in file content.",
            rationale: decodedSuspicious
              ? "Chuỗi base64 dài có thể giải mã thành text có nghĩa và phần text sau giải mã chứa chỉ dấu như command execution, remote URL, private key, hoặc secret."
              : multiStage
                ? "Chuỗi base64 dài xuất hiện cùng primitive decode/dynamic execution, đây là mẫu thường gặp ở loader hoặc script được obfuscate."
                : "Chuỗi base64 rất dài xuất hiện trong file text, vượt quá ngưỡng dữ liệu cấu hình thông thường và đáng để kiểm tra nguồn gốc.",
            recommendation: decodedSuspicious
              ? "Giải mã và rà soát phần nội dung này ngay, xác minh xem nó có phải payload, script tải từ xa, hoặc secret bị giấu hay không."
              : "Kiểm tra xem đây có phải asset/text hợp lệ không. Nếu không cần thiết, nên loại bỏ hoặc chuyển sang định dạng lưu trữ rõ nghĩa hơn.",
            falsePositiveNote: looksLikeBenignAssetPath(file.relativePath)
              ? "Nếu đây là asset embed hợp lệ hoặc fixture test, có thể chỉ cần ghi chú lại vị trí và giảm độ ưu tiên xử lý."
              : undefined,
            severity,
            confidence,
            category: decodedSuspicious ? "obfuscation" : "encoded",
            filePath: file.relativePath,
            lineNumber,
            detector: "encodedPayloadDetector",
            evidenceSnippet: compactValue(line),
            tags: ["encoded", "base64", decodedSuspicious ? "decoded-sensitive" : "long-sequence"],
            evidence: [
              createEvidence("Matched snippet", compactValue(line)),
              createEvidence("Decode status", decodedLooksText ? "Decoded to readable text" : "Did not decode to readable text", "metadata"),
              ...(decoded?.text ? [createEvidence("Decoded preview", compactValue(decoded.text, 180), "decoded")] : [])
            ]
          })
        );
      }

      while ((match = HEX_SEQUENCE.exec(content)) !== null) {
        const candidate = match[0];
        if (!candidate || candidate.length < 96 || !hasHexPayloadShape(candidate)) {
          continue;
        }
        const lineNumber = lineNumberFromIndex(content, match.index);
        const line = content.split(/\r?\n/)[lineNumber - 1] ?? candidate;
        findings.push(
          createFinding({
            ruleId: "encoded.hex.long-sequence",
            title: "Long hexadecimal payload candidate detected",
            summary: "File chứa chuỗi hex dài bất thường, có thể là blob nhị phân hoặc payload được nhúng trong text file.",
            description: "A long hex-encoded blob was found in text content.",
            rationale: "Chuỗi hex dài liên tục thường xuất hiện khi nhúng shellcode, dữ liệu nhị phân, hoặc payload được encode để né các kiểm tra bề mặt.",
            recommendation: "Xác minh nguồn gốc của chuỗi hex này và chuyển nó sang artifact/fixture được chú thích rõ nếu đây là dữ liệu hợp lệ.",
            falsePositiveNote: looksLikeBenignAssetPath(file.relativePath) ? "File trong thư mục asset/test có thể chứa fixture hợp lệ, nhưng vẫn nên kiểm tra kích thước và mục đích sử dụng." : undefined,
            severity: MULTI_STAGE_PATTERN.test(line) ? "high" : "medium",
            confidence: MULTI_STAGE_PATTERN.test(line) ? 0.84 : 0.7,
            category: "encoded",
            filePath: file.relativePath,
            lineNumber,
            detector: "encodedPayloadDetector",
            evidenceSnippet: compactValue(line),
            tags: ["encoded", "hex", "payload-candidate"],
            evidence: [createEvidence("Matched snippet", compactValue(line))]
          })
        );
      }

      const entropySignals = collectHighEntropySignals(content);
      for (const signal of entropySignals) {
        findings.push(
          createFinding({
            ruleId: signal.multiStage ? "obfuscation.high-entropy.multi-stage" : "encoded.high-entropy-string",
            title: signal.multiStage ? "High-entropy string used with decode/execution primitive" : "High-entropy string literal detected",
            summary: signal.multiStage
              ? "Chuỗi entropy cao xuất hiện cùng primitive giải mã hoặc thực thi động."
              : "File chứa chuỗi entropy cao bất thường, giống dữ liệu được encode hoặc obfuscate.",
            description: "A high-entropy string literal was found in file content.",
            rationale: signal.multiStage
              ? "Entropy cao kết hợp với primitive decode/execution là tín hiệu mạnh cho obfuscation hoặc staged payload."
              : "Chuỗi entropy cao dài bất thường trong file text thường là dữ liệu encode, token, hoặc blob nhúng khó đọc bằng mắt thường.",
            recommendation: "Rà soát ngữ cảnh sử dụng của chuỗi này và xác minh nó có phải fixture/token hợp lệ hay payload bị che giấu hay không.",
            falsePositiveNote: "Một số khóa test, fixture, hoặc hash hợp lệ cũng có entropy cao. Kiểm tra ngữ cảnh khai báo trước khi kết luận.",
            severity: signal.multiStage ? "high" : "medium",
            confidence: signal.multiStage ? 0.86 : 0.68,
            category: signal.multiStage ? "obfuscation" : "encoded",
            filePath: file.relativePath,
            lineNumber: signal.lineNumber,
            detector: "encodedPayloadDetector",
            evidenceSnippet: compactValue(signal.line),
            tags: ["high-entropy", signal.multiStage ? "multi-stage" : "encoded"],
            evidence: [createEvidence("Matched snippet", compactValue(signal.line))]
          })
        );
      }
    }

    return dedupeFindings(findings);
  }
};

function decodeBase64(value: string) {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const printable = decoded.length > 0 && printableRatio(decoded) >= 0.85;
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

function looksLikeSafeBase64(value: string) {
  return value.length < 96 || /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) === false;
}

function hasHexPayloadShape(value: string) {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return normalized.length >= 96 && normalized.length % 2 === 0;
}

function looksLikeBenignAssetPath(filePath: string) {
  return /(^|\/)(test|tests|fixtures|fixture|assets|images|docs)(\/|$)/i.test(filePath);
}

function collectHighEntropySignals(content: string) {
  const lines = content.split(/\r?\n/);
  return lines.flatMap((line, index) => {
    const candidates = [...line.matchAll(/[A-Za-z0-9+/=_-]{80,}/g)].map((match) => match[0]).filter(Boolean) as string[];
    return candidates
      .filter((candidate) => shannonEntropy(candidate) >= 4.3)
      .slice(0, 1)
      .map(() => ({
        line,
        lineNumber: index + 1,
        multiStage: MULTI_STAGE_PATTERN.test(line)
      }));
  }).slice(0, 12);
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
