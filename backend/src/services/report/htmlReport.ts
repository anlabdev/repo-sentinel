import type { Finding, ScanMetrics, ScanReport, UiLanguage } from "../../../../shared/src/index.js";

export function buildReportHtml(scan: ScanReport, language: UiLanguage = "vi") {
  const metrics = scan.metrics ?? emptyMetrics();
  const copy = getHtmlCopy(language);
  const tokenUsage = scan.tokenUsage;
  const tokenBreakdown = tokenUsage?.byPhase;
  const findings = scan.findings.slice(0, 20);
  const largestFiles = metrics.largestFiles.slice(0, 10);

  const findingsHtml = findings.length
    ? findings.map((finding) => renderFinding(finding, copy, language)).join("")
    : `<p class="muted">${copy.noFindings}</p>`;

  const largestFilesHtml = largestFiles.length
    ? `<div class="table-grid">${largestFiles.map((item) => `<div class="row"><span>${escapeHtml(item.path)}</span><strong>${formatBytes(item.totalBytes)}</strong></div>`).join("")}</div>`
    : `<p class="muted">${copy.noLargestFiles}</p>`;

  const secretsHtml = scan.secrets.length
    ? `<div class="table-grid">${scan.secrets.slice(0, 12).map((secret) => `<div class="row"><span><strong>${escapeHtml(secret.type)}</strong> · ${escapeHtml(secret.filePath)}${secret.lineNumber ? `:${secret.lineNumber}` : ""}</span><strong>${escapeHtml(secret.preview)}</strong></div>`).join("")}</div>`
    : `<p class="muted">${copy.noSecrets}</p>`;

  const externalHtml = scan.externalScanners.length
    ? `<div class="table-grid">${scan.externalScanners.map((tool) => `<div class="row"><span>${escapeHtml(tool.name)}</span><strong>${escapeHtml(tool.status)}</strong><small>${escapeHtml(tool.details)}</small></div>`).join("")}</div>`
    : `<p class="muted">${copy.noExternalScanners}</p>`;

  const aiHtml = scan.aiReview
    ? `
      <div class="detail-card">
        <div class="block-head">${copy.aiReview}</div>
        <p><strong>${escapeHtml(scan.aiReview.summary)}</strong></p>
        <div class="meta-grid two">
          <div class="metric"><span>${copy.severity}</span><strong>${escapeHtml(formatSeverityText(scan.aiReview.severity, language))}</strong></div>
          <div class="metric"><span>${copy.confidence}</span><strong>${formatConfidence(scan.aiReview.confidence)}</strong></div>
          <div class="metric"><span>${copy.totalTokens}</span><strong>${scan.aiReview.tokenUsage?.totalTokens ?? tokenBreakdown?.aiReview?.totalTokens ?? 0}</strong></div>
          <div class="metric"><span>${copy.suggestedRules}</span><strong>${scan.aiReview.suggestedRules.length}</strong></div>
        </div>
        <div class="meta-block"><span>${copy.reasoning}</span><p>${escapeHtml(scan.aiReview.reasoningSummary)}</p></div>
        <div class="meta-block"><span>${copy.recommendedAction}</span><p>${escapeHtml(scan.aiReview.recommendedAction)}</p></div>
        ${scan.aiReview.falsePositiveNotes?.length ? `<div class="meta-block"><span>${copy.falsePositive}</span><p>${escapeHtml(scan.aiReview.falsePositiveNotes.join("; "))}</p></div>` : ""}
        ${scan.aiReview.keyFindings?.length ? `<div class="evidence-list"><div class="block-head">${copy.topFindings}</div>${scan.aiReview.keyFindings.map((item) => `<div class="evidence-row"><span>${escapeHtml(item.ruleId)}</span><em>${escapeHtml(item.filePath)} · ${escapeHtml(formatSeverityText(item.severity, language))} · ${formatConfidence(item.confidence)}</em></div>`).join("")}</div>` : ""}
      </div>
    `
    : `<p class="muted">${copy.noAiReview}</p>`;

  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <title>${copy.reportTitle}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #040607;
        --surface: #090d11;
        --surface-soft: #0e141a;
        --border: #18202a;
        --text: #dbe4ef;
        --muted: #7e8996;
        --green: #4ade55;
        --red: #ff5a5a;
        --yellow: #f5b94f;
        --blue: #61a6ff;
      }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 28px; background: var(--bg); color: var(--text); font-family: Geist, Inter, system-ui, sans-serif; }
      .hero, .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 20px; margin-bottom: 16px; }
      .hero { background: linear-gradient(135deg, #07120a 0%, #0f1f14 100%); }
      .hero h1, .hero p { margin: 0 0 8px; }
      .hero small { color: rgba(219,228,239,.72); }
      .eyebrow, .block-head { color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
      .metric, .detail-card, .finding-card { background: var(--surface-soft); border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
      .metric span, .meta-block span { display: block; color: var(--muted); font-size: .78rem; margin-bottom: 8px; }
      .metric strong { font-size: 1.25rem; }
      .meta-grid { display: grid; gap: 12px; }
      .meta-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .finding-grid { display: grid; gap: 12px; }
      .finding-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: .72rem; border: 1px solid var(--border); }
      .pill.low { color: var(--green); }
      .pill.medium { color: var(--yellow); }
      .pill.high, .pill.critical { color: var(--red); }
      .meta-row, .meta-chips { color: var(--muted); font-size: .82rem; margin-bottom: 8px; }
      .meta-chips { display:flex; flex-wrap:wrap; gap:8px; }
      .chip { border:1px solid var(--border); border-radius:999px; padding:3px 8px; background:#0a1117; }
      .muted { color: var(--muted); }
      .code-block { margin-top: 10px; border: 1px solid rgba(97,166,255,.14); border-radius: 12px; overflow: hidden; }
      .code-block.ai-block { border-color: rgba(74,222,85,.14); }
      .code-block pre { margin: 0; padding: 12px; background: #070b10; color: #c8daff; white-space: pre-wrap; word-break: break-word; font: 12px/1.5 "Geist Mono", ui-monospace, monospace; }
      .detail-card.ai-card { border-color: rgba(74,222,85,.18); }
      .table-grid, .evidence-list { display: grid; gap: 8px; }
      .row, .evidence-row { display: grid; gap: 4px; padding: 10px 0; border-top: 1px solid var(--border); }
      .row:first-child, .evidence-row:first-child { border-top: 0; padding-top: 0; }
      h1, h2, h3, p { margin-top: 0; }
      h2 { margin-bottom: 14px; }
      @media (max-width: 1100px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .meta-grid.two { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <section class="hero">
      <div class="eyebrow">${copy.reportTitle}</div>
      <h1>${escapeHtml(scan.repoName)}</h1>
      <p>${escapeHtml(scan.repoUrl)}</p>
      <small>${copy.status}: <strong>${escapeHtml(formatStatusText(scan.status, language))}</strong> · ${copy.riskScore}: <strong>${scan.risk.totalScore}</strong> · AI: <strong>${scan.aiEscalated ? copy.yes : copy.no}</strong></small>
    </section>

    <section class="panel">
      <h2>${copy.overview}</h2>
      <div class="grid">
        <article class="metric"><span>${copy.totalSize}</span><strong>${formatBytes(metrics.totalBytes)}</strong></article>
        <article class="metric"><span>${copy.textFiles}</span><strong>${metrics.textFileCount}</strong></article>
        <article class="metric"><span>${copy.binaryLikeFiles}</span><strong>${metrics.binaryLikeFileCount}</strong></article>
        <article class="metric"><span>${copy.totalLoc}</span><strong>${metrics.totalLoc}</strong></article>
        <article class="metric"><span>${copy.totalTokens}</span><strong>${tokenUsage?.total.totalTokens ?? 0}</strong></article>
      </div>
    </section>

    <section class="panel">
      <h2>${copy.tokenBreakdown}</h2>
      <div class="grid">
        <article class="metric"><span>${copy.aiReviewTokens}</span><strong>${tokenBreakdown?.aiReview?.totalTokens ?? 0}</strong></article>
        <article class="metric"><span>${copy.aiTriageTokens}</span><strong>${tokenBreakdown?.aiTriage?.totalTokens ?? 0}</strong></article>
        <article class="metric"><span>${copy.reportExplanationTokens}</span><strong>${tokenBreakdown?.reportExplanation?.totalTokens ?? 0}</strong></article>
        <article class="metric"><span>${copy.findingExplanationTokens}</span><strong>${Object.values(tokenBreakdown?.findingExplanations ?? {}).reduce((sum, usage) => sum + Number(usage?.totalTokens ?? 0), 0)}</strong></article>
        <article class="metric"><span>${copy.explainedFindings}</span><strong>${Object.keys(tokenBreakdown?.findingExplanations ?? {}).length}</strong></article>
      </div>
    </section>

    <section class="panel">
      <h2>${copy.aiSection}</h2>
      ${aiHtml}
    </section>

    <section class="panel">
      <h2>${copy.topFindings}</h2>
      <div class="finding-grid">${findingsHtml}</div>
    </section>

    <section class="panel">
      <h2>${copy.largestFiles}</h2>
      ${largestFilesHtml}
    </section>

    <section class="panel">
      <h2>${copy.secrets}</h2>
      ${secretsHtml}
    </section>

    <section class="panel">
      <h2>${copy.externalScanners}</h2>
      ${externalHtml}
    </section>
  </body>
</html>`;
}

function renderFinding(finding: Finding, copy: ReturnType<typeof getHtmlCopy>, language: UiLanguage) {
  return `
    <article class="finding-card">
      <div class="finding-head">
        <span class="pill ${escapeHtml(finding.severity)}">${escapeHtml(formatSeverityText(finding.severity, language))}</span>
        <strong>${escapeHtml(finding.title)}</strong>
      </div>
      <div class="meta-row">${escapeHtml(finding.filePath)}${finding.lineNumber ? `:${finding.lineNumber}` : ""} · ${escapeHtml(finding.detector)}</div>
      <div class="meta-chips">
        <span class="chip">${copy.ruleId}: ${escapeHtml(finding.ruleId)}</span>
        <span class="chip">${copy.category}: ${escapeHtml(String(finding.category))}</span>
        <span class="chip">${copy.confidence}: ${formatConfidence(finding.confidence)}</span>
      </div>
      <div class="meta-block"><span>${copy.summary}</span><p>${escapeHtml(finding.summary)}</p></div>
      <div class="meta-block"><span>${copy.reasoning}</span><p>${escapeHtml(finding.rationale)}</p></div>
      <div class="meta-block"><span>${copy.recommendedAction}</span><p>${escapeHtml(finding.recommendation)}</p></div>
      ${finding.falsePositiveNote ? `<div class="meta-block"><span>${copy.falsePositive}</span><p>${escapeHtml(finding.falsePositiveNote)}</p></div>` : ""}
      ${finding.evidence?.length ? `<div class="evidence-list"><div class="block-head">${copy.evidence}</div>${finding.evidence.map((item) => `<div class="evidence-row"><span>${escapeHtml(item.label)}</span><em>${escapeHtml(item.value)}</em></div>`).join("")}</div>` : ""}
      ${finding.evidenceSnippet ? `<div class="code-block"><div class="block-head">${copy.codeContext}</div><pre>${escapeHtml(finding.evidenceSnippet)}</pre></div>` : ""}
      ${finding.aiTriage ? `
        <div class="detail-card ai-card">
          <div class="block-head">${copy.aiPinpoint}</div>
          <p><strong>${escapeHtml(finding.aiTriage.summary)}</strong></p>
          <div class="meta-chips">
            ${finding.aiTriage.suspiciousLineNumber ? `<span class="chip">${copy.line}: ${finding.aiTriage.suspiciousLineNumber}</span>` : ""}
            <span class="chip">${copy.confidence}: ${formatConfidence(finding.aiTriage.confidence)}</span>
          </div>
          <div class="meta-block"><span>${copy.reasoning}</span><p>${escapeHtml(finding.aiTriage.rationale ?? finding.aiTriage.reasoning)}</p></div>
          <div class="meta-block"><span>${copy.recommendedAction}</span><p>${escapeHtml(finding.aiTriage.recommendedAction)}</p></div>
          ${finding.aiTriage.falsePositiveNote ? `<div class="meta-block"><span>${copy.falsePositive}</span><p>${escapeHtml(finding.aiTriage.falsePositiveNote)}</p></div>` : ""}
          ${finding.aiTriage.suspiciousText ? `<div class="code-block ai-block"><div class="block-head">${copy.suspiciousText}</div><pre>${escapeHtml(finding.aiTriage.suspiciousText)}</pre></div>` : ""}
        </div>
      ` : ""}
    </article>
  `;
}

function getHtmlCopy(language: UiLanguage) {
  if (language === "en") {
    return {
      reportTitle: "RepoSentinel Report",
      overview: "Overview",
      topFindings: "Findings",
      noFindings: "No findings were captured.",
      secrets: "Secrets / suspicious strings",
      noSecrets: "No secret-like strings were detected.",
      aiSection: "AI review",
      aiReview: "AI review",
      noAiReview: "This scan did not trigger AI review.",
      status: "Status",
      riskScore: "Risk score",
      yes: "Yes",
      no: "No",
      summary: "Summary",
      reasoning: "Rationale",
      recommendedAction: "Recommended action",
      confidence: "Confidence",
      falsePositive: "False positive note",
      source: "Source",
      severity: "Severity",
      category: "Category",
      ruleId: "Rule ID",
      evidence: "Evidence",
      suggestedRules: "Suggested rules",
      totalSize: "Total size",
      textFiles: "Text files",
      binaryLikeFiles: "Binary-like files",
      totalLoc: "Total LOC",
      totalTokens: "Total tokens",
      tokenBreakdown: "Token breakdown",
      aiReviewTokens: "AI review",
      aiTriageTokens: "AI triage",
      reportExplanationTokens: "Report explanation",
      findingExplanationTokens: "Finding explanations",
      explainedFindings: "Cached findings",
      largestFiles: "Largest files",
      noLargestFiles: "No large-file inventory available.",
      externalScanners: "External scanners",
      noExternalScanners: "No external scanner results.",
      codeContext: "Code context",
      aiPinpoint: "AI pinpoint",
      suspiciousText: "Suspicious text",
      line: "Line"
    };
  }

  return {
    reportTitle: "Báo cáo RepoSentinel",
    overview: "Tổng quan",
    topFindings: "Phát hiện",
    noFindings: "Không có phát hiện nào.",
    secrets: "Bí mật / chuỗi đáng nghi",
    noSecrets: "Không phát hiện chuỗi giống secret.",
    aiSection: "Đánh giá AI",
    aiReview: "Đánh giá AI",
    noAiReview: "Lần quét này không gọi đánh giá AI.",
    status: "Trạng thái",
    riskScore: "Điểm rủi ro",
    yes: "Có",
    no: "Không",
    summary: "Tóm tắt",
    reasoning: "Lý do",
    recommendedAction: "Khuyến nghị",
    confidence: "Độ tin cậy",
    falsePositive: "Lưu ý false positive",
    source: "Nguồn",
    severity: "Mức độ",
    category: "Danh mục",
    ruleId: "Rule ID",
    evidence: "Bằng chứng",
    suggestedRules: "Rule gợi ý",
    totalSize: "Tổng dung lượng",
    textFiles: "Tệp văn bản",
    binaryLikeFiles: "Tệp nhị phân",
    totalLoc: "Tổng LOC",
    totalTokens: "Tổng token",
    tokenBreakdown: "Chi tiết token",
    aiReviewTokens: "AI review",
    aiTriageTokens: "AI triage",
    reportExplanationTokens: "Giải thích báo cáo",
    findingExplanationTokens: "Giải thích finding",
    explainedFindings: "Finding đã lưu",
    largestFiles: "Tệp lớn nhất",
    noLargestFiles: "Chưa có thống kê tệp lớn.",
    externalScanners: "Scanner ngoài",
    noExternalScanners: "Không có kết quả scanner ngoài.",
    codeContext: "Ngữ cảnh mã nguồn",
    aiPinpoint: "AI pinpoint",
    suspiciousText: "Đoạn nghi vấn",
    line: "Dòng"
  };
}

function formatSeverityText(value: string, language: UiLanguage) {
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

function formatStatusText(status: string, language: UiLanguage) {
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

function formatConfidence(value: number) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
