import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import type { Finding, ScanMetrics, ScanReport, UiLanguage } from "../../../../shared/src/index.js";
import type { AppEnv } from "../../config/env.js";

interface ReportCopy {
  title: string;
  subject: string;
  project: string;
  status: string;
  riskScore: string;
  severity: string;
  aiReview: string;
  yes: string;
  no: string;
  duration: string;
  scanInventory: string;
  directoriesScanned: string;
  filesScanned: string;
  textFiles: string;
  binaryLikeFiles: string;
  totalLines: string;
  totalLoc: string;
  totalSize: string;
  throughput: string;
  findings: string;
  noFindings: string;
  largestFiles: string;
  noLargestFiles: string;
  secrets: string;
  noSecrets: string;
  aiSection: string;
  noAiReview: string;
  confidence: string;
  recommendedAction: string;
  reasoning: string;
  falsePositive: string;
  ruleId: string;
  category: string;
  evidence: string;
  externalScanners: string;
  summary: string;
  line: string;
  codeContext: string;
  suspiciousText: string;
}

export async function buildReportPdf(scan: ScanReport, env: AppEnv, language: UiLanguage = "vi") {
  const copy = getReportCopy(language);
  const fontBytes = await resolvePdfFontBytes(env);
  if (!fontBytes) {
    return createLegacyPdfFromText(reportToPlainText(scan, language));
  }

  const metrics = scan.metrics ?? emptyMetrics();
  const tokenUsage = scan.tokenUsage;
  const suppressedFindings = getRawNumber(scan.raw, "suppressedFindings");
  const allowlistRules = getRawStringArray(scan.raw, "allowlistRulesApplied");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(`${copy.title} - ${scan.repoName}`);
  pdfDoc.setAuthor("RepoSentinel");
  pdfDoc.setSubject(copy.subject);
  pdfDoc.setCreator("RepoSentinel");
  pdfDoc.setProducer("RepoSentinel");

  const regularFont = await pdfDoc.embedFont(fontBytes, { subset: true });
  const boldFont = regularFont;
  const pageSize: [number, number] = [595.28, 841.89];
  const marginX = 42;
  const contentWidth = pageSize[0] - marginX * 2;
  let page = pdfDoc.addPage(pageSize);
  let y = 790;

  const drawPageChrome = () => {
    page.drawRectangle({ x: 36, y: 794, width: 523, height: 20, color: rgb(0.12, 0.17, 0.12) });
    page.drawText("RepoSentinel", { x: 48, y: 800, size: 13, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText(new Date().toLocaleString(language === "vi" ? "vi-VN" : "en-US"), { x: 330, y: 801, size: 8, font: regularFont, color: rgb(1, 1, 1) });
    y = 768;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < 50) {
      page = pdfDoc.addPage(pageSize);
      drawPageChrome();
    }
  };

  const drawWrapped = (text: string, options?: { size?: number; font?: PDFFont; indent?: number; color?: ReturnType<typeof rgb>; gapAfter?: number }) => {
    const size = options?.size ?? 10;
    const font = options?.font ?? regularFont;
    const indent = options?.indent ?? 0;
    const color = options?.color ?? rgb(0.09, 0.13, 0.09);
    const gapAfter = options?.gapAfter ?? 4;
    const lines = wrapPdfText(text, font, size, contentWidth - indent);
    ensureSpace(lines.length * (size + 4) + gapAfter + 6);
    for (const line of lines) {
      page.drawText(line, { x: marginX + indent, y, size, font, color });
      y -= size + 4;
    }
    y -= gapAfter;
  };

  const drawSection = (title: string) => {
    ensureSpace(34);
    page.drawRectangle({ x: 36, y: y - 8, width: 523, height: 22, color: rgb(0.92, 0.95, 0.92) });
    page.drawText(title, { x: 46, y: y + 5, size: 12, font: boldFont, color: rgb(0.12, 0.17, 0.12) });
    y -= 30;
  };

  const drawKeyValue = (label: string, value: string) => {
    drawWrapped(`${label}: ${value}`);
  };

  drawPageChrome();
  drawSection(copy.title);
  drawKeyValue(copy.project, scan.repoUrl);
  drawKeyValue(copy.status, formatStatus(scan.status, language));
  drawKeyValue(copy.riskScore, String(scan.risk.totalScore));
  drawKeyValue(copy.severity, formatSeverity(scan.risk.severityBucket, language));
  drawKeyValue(copy.aiReview, scan.aiEscalated ? copy.yes : copy.no);
  drawKeyValue(copy.duration, formatDuration(metrics.durationMs));

  drawSection(copy.scanInventory);
  drawKeyValue(copy.directoriesScanned, String(metrics.directoryCount));
  drawKeyValue(copy.filesScanned, String(metrics.fileCount));
  drawKeyValue(copy.textFiles, String(metrics.textFileCount));
  drawKeyValue(copy.binaryLikeFiles, String(metrics.binaryLikeFileCount));
  drawKeyValue(copy.totalLines, String(metrics.totalLines));
  drawKeyValue(copy.totalLoc, String(metrics.totalLoc));
  drawKeyValue(copy.totalSize, formatBytes(metrics.totalBytes));
  drawKeyValue(copy.throughput, `${scan.runtime?.throughputFilesPerSecond ?? 0} ${language === "vi" ? "tệp/giây" : "files/s"}`);
  drawKeyValue(language === "vi" ? "Tổng token" : "Total tokens", String(tokenUsage?.total.totalTokens ?? 0));
  drawKeyValue(language === "vi" ? "AI review" : "AI review", String(tokenUsage?.byPhase?.aiReview?.totalTokens ?? 0));
  drawKeyValue(language === "vi" ? "AI triage" : "AI triage", String(tokenUsage?.byPhase?.aiTriage?.totalTokens ?? 0));
  drawKeyValue(language === "vi" ? "Giải thích báo cáo" : "Report explanation", String(tokenUsage?.byPhase?.reportExplanation?.totalTokens ?? 0));
  drawKeyValue(language === "vi" ? "Giải thích finding" : "Finding explanations", String(Object.values(tokenUsage?.byPhase?.findingExplanations ?? {}).reduce((sum, usage) => sum + Number(usage?.totalTokens ?? 0), 0)));

  drawSection(language === "vi" ? "Allowlist & suppression" : "Allowlist & suppression");
  drawKeyValue(language === "vi" ? "Finding bị ẩn" : "Suppressed findings", String(suppressedFindings));
  drawKeyValue(language === "vi" ? "Rule allowlist" : "Allowlist rules", String(allowlistRules.length));
  if (allowlistRules.length) {
    for (const rule of allowlistRules.slice(0, 12)) {
      drawWrapped(`- ${rule}`);
    }
  }

  drawSection(copy.findings);
  if (scan.findings.length === 0) {
    drawWrapped(copy.noFindings);
  } else {
    for (const finding of scan.findings.slice(0, 14)) {
      drawFinding(finding, copy, language, drawWrapped, boldFont);
    }
  }

  drawSection(copy.largestFiles);
  if (metrics.largestFiles.length === 0) {
    drawWrapped(copy.noLargestFiles);
  } else {
    for (const fileStat of metrics.largestFiles.slice(0, 10)) {
      drawWrapped(`- ${fileStat.path} | ${formatBytes(fileStat.totalBytes)}`);
    }
  }

  drawSection(copy.secrets);
  if (scan.secrets.length === 0) {
    drawWrapped(copy.noSecrets);
  } else {
    for (const secret of scan.secrets.slice(0, 12)) {
      drawWrapped(`- ${secret.type} | ${secret.filePath}${secret.lineNumber ? `:${secret.lineNumber}` : ""}`);
    }
  }

  drawSection(copy.aiSection);
  if (!scan.aiReview) {
    drawWrapped(copy.noAiReview);
  } else {
    drawKeyValue("Model", scan.aiReview.model);
    drawKeyValue(copy.severity, formatSeverity(scan.aiReview.severity, language));
    drawKeyValue(copy.confidence, formatConfidence(scan.aiReview.confidence));
    drawWrapped(`${copy.summary}: ${scan.aiReview.summary}`, { gapAfter: 2 });
    drawWrapped(`${copy.reasoning}: ${scan.aiReview.reasoningSummary}`, { indent: 14, size: 9, gapAfter: 4 });
    drawWrapped(`${copy.recommendedAction}: ${scan.aiReview.recommendedAction}`, { indent: 14, size: 9, gapAfter: 4 });
    if (scan.aiReview.falsePositiveNotes?.length) {
      drawWrapped(`${copy.falsePositive}: ${scan.aiReview.falsePositiveNotes.join("; ")}`, { indent: 14, size: 9, gapAfter: 4 });
    }
  }

  drawSection(copy.externalScanners);
  for (const tool of scan.externalScanners) {
    drawWrapped(`- ${tool.name}: ${tool.status} - ${tool.details}`);
  }

  return await pdfDoc.save();
}

function drawFinding(
  finding: Finding,
  copy: ReportCopy,
  language: UiLanguage,
  drawWrapped: (text: string, options?: { size?: number; font?: PDFFont; indent?: number; color?: ReturnType<typeof rgb>; gapAfter?: number }) => void,
  boldFont: PDFFont
) {
  drawWrapped(`[${formatSeverity(finding.severity, language)}] ${finding.title} | ${finding.filePath}${finding.lineNumber ? `:${finding.lineNumber}` : ""}`, { font: boldFont, gapAfter: 2 });
  drawWrapped(`${copy.ruleId}: ${finding.ruleId}`, { indent: 14, size: 9, gapAfter: 2 });
  drawWrapped(`${copy.category}: ${String(finding.category)} | ${copy.confidence}: ${formatConfidence(finding.confidence)}`, { indent: 14, size: 9, gapAfter: 2 });
  drawWrapped(`${copy.summary}: ${finding.summary}`, { indent: 14, size: 9, gapAfter: 2 });
  drawWrapped(`${copy.reasoning}: ${finding.rationale}`, { indent: 14, size: 9, gapAfter: 2 });
  drawWrapped(`${copy.recommendedAction}: ${finding.recommendation}`, { indent: 14, size: 9, gapAfter: 2 });
  if (finding.falsePositiveNote) {
    drawWrapped(`${copy.falsePositive}: ${finding.falsePositiveNote}`, { indent: 14, size: 9, gapAfter: 2 });
  }
  if (finding.evidence?.length) {
    drawWrapped(`${copy.evidence}:`, { indent: 14, size: 9, font: boldFont, gapAfter: 2 });
    for (const item of finding.evidence.slice(0, 4)) {
      drawWrapped(`- ${item.label}: ${item.value.replace(/\s+/g, " ")}`, { indent: 18, size: 8, gapAfter: 2 });
    }
  }
  if (finding.evidenceSnippet) {
    drawWrapped(`${copy.codeContext}: ${finding.evidenceSnippet.replace(/\s+/g, " ")}`, { indent: 14, size: 8, gapAfter: 4 });
  }
  if (finding.aiTriage) {
    drawWrapped(`AI pinpoint: ${finding.aiTriage.summary}`, { indent: 14, size: 8, font: boldFont, gapAfter: 2 });
    if (finding.aiTriage.suspiciousLineNumber) {
      drawWrapped(`${copy.line}: ${finding.aiTriage.suspiciousLineNumber}`, { indent: 18, size: 8, gapAfter: 2 });
    }
    drawWrapped(`${copy.confidence}: ${formatConfidence(finding.aiTriage.confidence)}`, { indent: 18, size: 8, gapAfter: 2 });
    drawWrapped(`${copy.reasoning}: ${(finding.aiTriage.rationale ?? finding.aiTriage.reasoning).replace(/\s+/g, " ")}`, { indent: 18, size: 8, gapAfter: 2 });
    drawWrapped(`${copy.recommendedAction}: ${finding.aiTriage.recommendedAction}`, { indent: 18, size: 8, gapAfter: 2 });
    if (finding.aiTriage.falsePositiveNote) {
      drawWrapped(`${copy.falsePositive}: ${finding.aiTriage.falsePositiveNote}`, { indent: 18, size: 8, gapAfter: 2 });
    }
    if (finding.aiTriage.suspiciousText) {
      drawWrapped(`${copy.suspiciousText}: ${finding.aiTriage.suspiciousText.replace(/\s+/g, " ")}`, { indent: 18, size: 8, gapAfter: 4 });
    }
  }
}

async function resolvePdfFontBytes(env: AppEnv) {
  const candidates = [env.pdfFontPath, "C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\tahoma.ttf"].filter(
    (value): value is string => Boolean(value)
  );

  for (const candidate of candidates) {
    try {
      const absolutePath = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), "..", candidate);
      return await fs.readFile(absolutePath);
    } catch {
      continue;
    }
  }

  return null;
}

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let partial = "";
    for (const char of word) {
      const next = `${partial}${char}`;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        partial = next;
      } else {
        if (partial) {
          lines.push(`${partial}-`);
        }
        partial = char;
      }
    }
    current = partial;
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function reportToPlainText(scan: ScanReport, language: UiLanguage) {
  const copy = getReportCopy(language);
  return [
    copy.title,
    `${copy.project}: ${scan.repoUrl}`,
    `${copy.status}: ${formatStatus(scan.status, language)}`,
    `${copy.riskScore}: ${scan.risk.totalScore}`,
    `${copy.severity}: ${formatSeverity(scan.risk.severityBucket, language)}`,
    "",
    `${copy.findings}:`,
    ...scan.findings.map((finding) => `- [${formatSeverity(finding.severity, language)}] ${finding.title} | ${finding.ruleId} | ${finding.filePath} | ${finding.detector}`)
  ].join("\n");
}

function createLegacyPdfFromText(text: string) {
  const lines = text.split(/\r?\n/).slice(0, 120);
  const escaped = lines.map((line) => line.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\x20-\x7E]/g, " ").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const content = ["BT", "/F1 10 Tf", "50 780 Td", ...escaped.flatMap((line, index) => (index === 0 ? [`(${line}) Tj`] : ["0 -14 Td", `(${line}) Tj`])), "ET"].join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function getReportCopy(language: UiLanguage): ReportCopy {
  if (language === "en") {
    return {
      title: "REPOSENTINEL SECURITY REPORT",
      subject: "Repository scan report",
      project: "Project",
      status: "Status",
      riskScore: "Risk score",
      severity: "Severity",
      aiReview: "AI review",
      yes: "Yes",
      no: "No",
      duration: "Scan duration",
      scanInventory: "SCAN INVENTORY",
      directoriesScanned: "Directories scanned",
      filesScanned: "Files scanned",
      textFiles: "Text files",
      binaryLikeFiles: "Binary-like files",
      totalLines: "Total lines",
      totalLoc: "Total LOC",
      totalSize: "Total size",
      throughput: "Throughput",
      findings: "TOP FINDINGS",
      noFindings: "No findings were captured.",
      largestFiles: "LARGEST FILES",
      noLargestFiles: "No large-file inventory available.",
      secrets: "SECRET-LIKE STRINGS",
      noSecrets: "No secret-like strings were detected.",
      aiSection: "AI REVIEW",
      noAiReview: "This scan did not trigger AI review.",
      confidence: "Confidence",
      recommendedAction: "Recommended action",
      reasoning: "Rationale",
      falsePositive: "False positive note",
      ruleId: "Rule ID",
      category: "Category",
      evidence: "Evidence",
      externalScanners: "EXTERNAL SCANNERS",
      summary: "Summary",
      line: "Line",
      codeContext: "Code context",
      suspiciousText: "Suspicious text"
    };
  }

  return {
    title: "BÁO CÁO BẢO MẬT REPOSENTINEL",
    subject: "Báo cáo quét repository",
    project: "Dự án",
    status: "Trạng thái",
    riskScore: "Điểm rủi ro",
    severity: "Mức độ",
    aiReview: "Đánh giá AI",
    yes: "Có",
    no: "Không",
    duration: "Thời gian quét",
    scanInventory: "THỐNG KÊ QUÉT",
    directoriesScanned: "Thư mục đã quét",
    filesScanned: "Tệp đã quét",
    textFiles: "File text",
    binaryLikeFiles: "File binary-like",
    totalLines: "Tổng dòng",
    totalLoc: "Tổng LOC",
    totalSize: "Tổng dung lượng",
    throughput: "Thông lượng",
    findings: "PHÁT HIỆN NỔI BẬT",
    noFindings: "Không có phát hiện nào.",
    largestFiles: "TỆP LỚN NHẤT",
    noLargestFiles: "Chưa có thống kê tệp lớn.",
    secrets: "CHUỖI BÍ MẬT",
    noSecrets: "Không phát hiện chuỗi giống secret.",
    aiSection: "ĐÁNH GIÁ AI",
    noAiReview: "Lần quét này không gọi đánh giá AI.",
    confidence: "Độ tin cậy",
    recommendedAction: "Khuyến nghị",
    reasoning: "Lý do",
    falsePositive: "Lưu ý false positive",
    ruleId: "Rule ID",
    category: "Danh mục",
    evidence: "Bằng chứng",
    externalScanners: "SCANNER NGOÀI",
    summary: "Tóm tắt",
    line: "Dòng",
    codeContext: "Ngữ cảnh mã nguồn",
    suspiciousText: "Đoạn nghi vấn"
  };
}

function formatSeverity(value: string, language: UiLanguage) {
  if (language === "en") {
    switch (value) {
      case "critical": return "Critical";
      case "high": return "High";
      case "medium": return "Medium";
      case "low": return "Low";
      default: return value;
    }
  }
  switch (value) {
    case "critical": return "Nghiêm trọng";
    case "high": return "Cao";
    case "medium": return "Trung bình";
    case "low": return "Thấp";
    default: return value;
  }
}

function formatStatus(status: string, language: UiLanguage) {
  if (language === "en") {
    switch (status) {
      case "queued": return "Queued";
      case "running": return "Running";
      case "completed": return "Completed";
      case "failed": return "Failed";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  }
  switch (status) {
    case "queued": return "Đã xếp hàng";
    case "running": return "Đang chạy";
    case "completed": return "Hoàn tất";
    case "failed": return "Thất bại";
    case "cancelled": return "Đã hủy";
    default: return status;
  }
}

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "0s";
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatConfidence(value: number) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function emptyMetrics(): ScanMetrics {
  return {
    directoryCount: 0,
    fileCount: 0,
    textFileCount: 0,
    binaryLikeFileCount: 0,
    totalBytes: 0,
    totalLines: 0,
    totalLoc: 0,
    durationMs: 0,
    byExtension: [],
    largestFiles: [],
    largestDirectories: [],
    fileErrors: []
  };
}

function getRawNumber(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

function getRawStringArray(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
