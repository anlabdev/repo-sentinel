import { Fragment, useEffect, useRef, useState } from "react";
import type { ScanReport, UiLanguage } from "../../../shared/src/index.js";
import { api, type AiExplanationResponse } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import type { IconName } from "../types/ui.js";
import { formatBytes, formatCategoryLabel, formatConfidence, formatDuration, languageLabel, severityLabel, statusLabel } from "../utils/format.js";
import { Icon } from "./Icon.js";
import { OverlayScrollArea } from "./OverlayScrollArea.js";

export function LivePanel({
  scan,
  full,
  onCancel,
  copy,
  language,
  showLargestFiles,
  onToggleLargestFiles,
  enableCategoryFilter,
  selectedFindingId,
  selectedFindingExplanation,
  selectedFindingLoading,
  onSelectFinding,
  onRetryFindingDetail,
  onRetryAiReview,
  retryingAiReview
}: {
  scan: ScanReport | null;
  full?: boolean;
  onCancel?: () => Promise<void>;
  copy: CopySet;
  language: UiLanguage;
  showLargestFiles: boolean;
  onToggleLargestFiles?: () => void;
  enableCategoryFilter?: boolean;
  selectedFindingId?: string | null;
  selectedFindingExplanation?: AiExplanationResponse;
  selectedFindingLoading?: boolean;
  onSelectFinding?: (findingId: string) => void;
  onRetryFindingDetail?: () => void;
  onRetryAiReview?: () => Promise<void>;
  retryingAiReview?: boolean;
}) {
  const aiDetailRef = useRef<HTMLDivElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const scanFindings = scan?.findings ?? [];
  const findingCategories = Array.from(new Set(scanFindings.map((finding) => finding.category))).sort((a, b) => a.localeCompare(b));
  const resolvedCategory = enableCategoryFilter ? activeCategory : "all";
  const visibleFindings = scanFindings.filter((finding) => resolvedCategory === "all" || finding.category === resolvedCategory);

  useEffect(() => {
    if (!full || !scan || !selectedFindingId || !aiDetailRef.current) return;
    aiDetailRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [full, scan, selectedFindingId]);

  useEffect(() => {
    if (!scan || !onSelectFinding) return;
    const firstVisibleFinding = visibleFindings[0];
    if (!firstVisibleFinding) return;
    if (!selectedFindingId || !visibleFindings.some((finding) => finding.id === selectedFindingId)) {
      onSelectFinding(firstVisibleFinding.id);
    }
  }, [onSelectFinding, scan, selectedFindingId, visibleFindings]);

  if (!scan) {
    return <section className={`rs-panel ${full ? "rs-full" : ""}`}><div className="rs-empty">{copy.noActiveScan}</div></section>;
  }

  const liveStatusIcon: IconName = scan.status === "completed" ? "check" : scan.status === "failed" ? "close" : "clock";
  const metrics = scan.metrics;
  const fileErrors = metrics?.fileErrors ?? [];
  const largestFiles = metrics?.largestFiles ?? [];
  const groupedFindings = findingCategories
    .filter((category) => resolvedCategory === "all" || category === resolvedCategory)
    .map((category) => ({ category, items: visibleFindings.filter((finding) => finding.category === category) }))
    .filter((group) => group.items.length > 0);
  const selectedFinding = visibleFindings.find((finding) => finding.id === selectedFindingId) ?? visibleFindings[0] ?? scan.findings[0];

  return (
    <section className={`rs-panel ${full ? "rs-full" : ""}`}>
      <div className="rs-live-top">
        <div className="rs-live-left">
          <span className={`rs-live-state ${scan.status}`}><Icon name={liveStatusIcon} /></span>
          <span className="rs-live-name">{scan.repoName}</span>
          <b>{statusLabel(scan.status, language)}</b>
        </div>
        <div className="rs-live-right">{full && onToggleLargestFiles ? <button type="button" className="rs-secondary rs-secondary-compact rs-live-toggle" onClick={() => onToggleLargestFiles()}>{showLargestFiles ? copy.hideLargestFiles : copy.showLargestFiles}</button> : null}<span className="rs-live-summary">{metrics?.fileCount ?? scan.runtime?.filesEnumerated ?? 0}/{metrics?.fileCount ?? scan.runtime?.filesEnumerated ?? 0} {language === "vi" ? "tệp" : "files"} {formatDuration(scan.startedAt, scan.completedAt, language)}</span></div>
      </div>
      {scan.errorMessage ? <div className="rs-live-error"><strong>{copy.fileIssues}</strong><span>{scan.errorMessage}</span></div> : null}
      <div className="rs-live-progress">
        <div className="rs-mini-bar"><span style={{ width: `${scan.progress ?? 0}%` }} /></div>
        <div className="rs-live-meta"><small>{copy.progress}: {scan.progress ?? 0}%</small><small>{scan.findings.length} {copy.findings.toLowerCase()}</small></div>
      </div>
      {metrics ? <div className="rs-live-stats-grid"><div className="rs-live-stat"><span>{copy.totalSize}</span><strong>{formatBytes(metrics.totalBytes)}</strong></div><div className="rs-live-stat"><span>{copy.textFiles}</span><strong>{metrics.textFileCount}</strong></div><div className="rs-live-stat"><span>{copy.binaryLikeFiles}</span><strong>{metrics.binaryLikeFileCount}</strong></div><div className="rs-live-stat"><span>{copy.totalLoc}</span><strong>{metrics.totalLoc}</strong></div><div className="rs-live-stat"><span>{copy.totalTokens}</span><strong>{scan.tokenUsage?.total.totalTokens ?? 0}</strong></div></div> : null}
      <div className={`rs-live-columns ${metrics ? "rs-live-columns-rich" : ""} ${showLargestFiles ? "" : "rs-live-columns-two"}`.trim()}>
        <div className="rs-live-col">
          <div className="rs-col-head"><Icon name="alert" />{copy.findings} <small>({scan.findings.length})</small></div>
          <div className="rs-live-col-body">
            {enableCategoryFilter && scan.findings.length > 0 ? <div className="rs-category-filter-shell"><span>{copy.categoryFilter}</span><div className="rs-category-filter-row"><button type="button" className={activeCategory === "all" ? "is-active" : ""} onClick={() => setActiveCategory("all")}>{copy.categoryAll}</button>{findingCategories.map((category) => <button type="button" key={category} className={activeCategory === category ? "is-active" : ""} onClick={() => setActiveCategory(category)}>{formatCategoryLabel(category, language)}</button>)}</div></div> : null}
            <OverlayScrollArea className="rs-scroll-shell" viewportClassName="rs-col-list">
              {groupedFindings.map((group) => <div className="rs-finding-group" key={group.category}><div className="rs-finding-group-head"><span>{enableCategoryFilter ? formatCategoryLabel(group.category, language) : copy.findings}</span><small>{group.items.length}</small></div>{group.items.slice(0, full ? 12 : 6).map((finding) => <button type="button" className={`rs-finding rs-finding-rich rs-finding-button ${selectedFinding?.id === finding.id ? "is-selected" : ""}`.trim()} key={finding.id} onClick={() => onSelectFinding?.(finding.id)}><b className={finding.severity}>{severityLabel(finding.severity, language)}</b><p>{finding.title}</p><small>{finding.filePath}{finding.lineNumber ? `:${finding.lineNumber}` : ""}</small><div className="rs-finding-copy"><span>{copy.ruleId}</span><em>{finding.ruleId}</em><span>{copy.category}</span><em>{formatCategoryLabel(finding.category, language)}</em><span>{copy.confidence}</span><em>{formatConfidence(finding.confidence)}</em><span>{copy.summary}</span><em>{finding.summary}</em><span>{copy.reasoning}</span><em>{finding.rationale}</em>{finding.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{finding.falsePositiveNote}</em></> : null}{finding.evidenceSnippet ? renderCodeBlock(copy.codeContext, finding.evidenceSnippet) : null}</div></button>)}</div>)}
              {visibleFindings.length === 0 ? <div className="rs-col-empty">{copy.noFindingsYet}</div> : null}
            </OverlayScrollArea>
          </div>
        </div>
        <div className="rs-live-col rs-live-col-ai">
          <div className="rs-col-head"><Icon name="sparkles" />{copy.aiReview} <b>{scan.aiReview ? (language === "vi" ? "bật" : "on") : (language === "vi" ? "tắt" : "off")}</b></div>
          <OverlayScrollArea className="rs-scroll-shell" viewportClassName="rs-ai-copy">
            {scan.aiReview ? <div className="rs-ai-sections">
              <section className="rs-ai-section">
                <div className="rs-ai-section-head">{copy.aiReview}</div>
                <p>{scan.aiReview.summary}</p>
                <div className="rs-finding-copy">
                  <span>{copy.source}</span><em>{languageLabel(scan.aiReview.language ?? "en", language)}</em>
                  <span>{copy.confidence}</span><em>{formatConfidence(scan.aiReview.confidence)}</em>
                  <span>{copy.reasoning}</span><em>{scan.aiReview.reasoningSummary}</em>
                  <span>{copy.totalTokens}</span><em>{scan.aiReview.tokenUsage?.totalTokens ?? scan.tokenUsage?.byPhase?.aiReview?.totalTokens ?? 0}</em>
                  <span>{copy.recommendedAction}</span><em>{scan.aiReview.recommendedAction}</em>
                  {scan.aiReview.falsePositiveNotes?.length ? <><span>{copy.falsePositive}</span><em>{scan.aiReview.falsePositiveNotes.join("; ")}</em></> : null}
                </div>
                {scan.aiReview.language && scan.aiReview.language !== language ? <div className="rs-ai-language-note"><span>{copy.aiReviewLanguageMismatch} <b>{languageLabel(scan.aiReview.language, language)}</b>.</span><button type="button" className="rs-secondary rs-secondary-compact" onClick={() => void onRetryAiReview?.()} disabled={retryingAiReview}>{retryingAiReview ? copy.aiReviewRefreshing : copy.refreshAiReviewLanguage}</button></div> : null}
              </section>
              <section ref={aiDetailRef} className="rs-ai-section rs-ai-detail-section">
                <div className="rs-ai-section-header">
                  <div className="rs-ai-section-head">{copy.aiDetail}</div>
                  {selectedFinding ? <button type="button" className="rs-secondary rs-secondary-compact rs-ai-retry" onClick={() => onRetryFindingDetail?.()} disabled={selectedFindingLoading}>{selectedFindingLoading ? copy.aiAnalyzing : copy.retryAiDetail}</button> : null}
                </div>
                {selectedFinding ? <div className="rs-ai-finding-detail">
                  <div className="rs-detail-card">
                    <div className="rs-finding-copy">
                      <span>{copy.selectedFinding}</span><em>{selectedFinding.title}</em>
                      <span>{copy.ruleId}</span><em>{selectedFinding.ruleId}</em>
                      <span>{copy.detector}</span><em>{selectedFinding.detector}</em>
                      <span>{copy.category}</span><em>{formatCategoryLabel(selectedFinding.category, language)}</em>
                      <span>{copy.confidence}</span><em>{formatConfidence(selectedFinding.confidence)}</em>
                      <span>File</span><em>{selectedFinding.filePath}{selectedFinding.lineNumber ? `:${selectedFinding.lineNumber}` : ""}</em>
                      <span>{copy.summary}</span><em>{selectedFinding.summary}</em>
                      <span>{copy.reasoning}</span><em>{selectedFinding.rationale}</em>
                      <span>{copy.recommendedAction}</span><em>{selectedFinding.recommendation}</em>
                      {selectedFinding.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{selectedFinding.falsePositiveNote}</em></> : null}
                    </div>
                    {renderEvidenceList(copy.evidence, selectedFinding.evidence)}
                    {selectedFinding.evidenceSnippet ? renderCodeBlock(copy.codeContext, selectedFinding.evidenceSnippet) : null}
                  </div>
                  {selectedFinding.aiTriage ? <div className="rs-detail-card rs-detail-card-ai">
                    <div className="rs-finding-copy">
                      <span>{copy.aiPinpoint}</span><em>{selectedFinding.aiTriage.summary}</em>
                      {selectedFinding.aiTriage.suspiciousLineNumber ? <><span>Line</span><em>{selectedFinding.aiTriage.suspiciousLineNumber}</em></> : null}
                      <span>{copy.confidence}</span><em>{formatConfidence(selectedFinding.aiTriage.confidence)}</em>
                      <span>{copy.reasoning}</span><em>{selectedFinding.aiTriage.rationale ?? selectedFinding.aiTriage.reasoning}</em>
                      <span>{copy.recommendedAction}</span><em>{selectedFinding.aiTriage.recommendedAction}</em>
                      {selectedFinding.aiTriage.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{selectedFinding.aiTriage.falsePositiveNote}</em></> : null}
                    </div>
                    {selectedFinding.aiTriage.suspiciousText ? renderCodeBlock(copy.suspiciousText, selectedFinding.aiTriage.suspiciousText, "rs-code-block-ai") : null}
                  </div> : null}
                  {selectedFindingLoading ? <div className="rs-col-empty">{copy.aiAnalyzing}</div> : selectedFindingExplanation ? <div className="rs-detail-card">
                    <div className="rs-finding-copy">
                      <span>{copy.summary}</span><em>{selectedFindingExplanation.summary}</em>
                      <span>{copy.reasoning}</span><em>{selectedFindingExplanation.rationale ?? selectedFindingExplanation.explanation}</em>
                      <span>{copy.confidence}</span><em>{formatConfidence(selectedFindingExplanation.confidence)}</em>
                      <span>{copy.totalTokens}</span><em>{selectedFindingExplanation.tokenUsage?.totalTokens ?? 0}</em>
                      <span>{copy.source}</span><em>{renderExplanationSourceBadge(selectedFindingExplanation.cacheSource, copy)}</em>
                      <span>{copy.recommendedAction}</span><em>{selectedFindingExplanation.recommendedAction}</em>
                      {selectedFindingExplanation.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{selectedFindingExplanation.falsePositiveNote}</em></> : null}
                      {selectedFindingExplanation.error ? <em>{selectedFindingExplanation.error}</em> : null}
                    </div>
                    {selectedFindingExplanation.relatedSnippet ? renderCodeBlock(copy.suspiciousText, selectedFindingExplanation.relatedSnippet, "rs-code-block-ai") : null}
                  </div> : <div className="rs-col-empty">{copy.selectFindingHint}</div>}
                </div> : <div className="rs-col-empty">{copy.selectFindingHint}</div>}
              </section>
            </div> : <div className="rs-col-empty">{copy.aiReviewOff}</div>}
          </OverlayScrollArea>
        </div>
        {showLargestFiles ? <div className="rs-live-col rs-live-col-files">
          <div className="rs-col-head"><Icon name="folder" />{fileErrors.length ? copy.readErrors : copy.largestFiles} <small>({fileErrors.length || largestFiles.length || scan.suspiciousFiles.length})</small></div>
          <OverlayScrollArea className="rs-scroll-shell" viewportClassName="rs-col-list">
            {fileErrors.length > 0 ? fileErrors.map((item) => <div className="rs-finding rs-finding-rich" key={`${item.path}:${item.message}`}><p>{item.path}</p><div className="rs-finding-copy"><span>{copy.fileIssues}</span><em>{item.message}</em><small>{formatBytes(item.size)}</small></div></div>) : largestFiles.length > 0 ? largestFiles.slice(0, full ? 12 : 6).map((item) => <div className="rs-suspicious rs-file-stat" key={item.path}><strong>{item.path}</strong><small>{formatBytes(item.totalBytes)}</small></div>) : scan.suspiciousFiles.length > 0 ? scan.suspiciousFiles.slice(0, full ? 12 : 6).map((item) => <div className="rs-suspicious" key={item}>{item}</div>) : <div className="rs-col-empty">{copy.noFileIssues}</div>}
          </OverlayScrollArea>
        </div> : null}
      </div>
      {full ? <div className="rs-live-actions"><div className="rs-history-actions"><a className="rs-secondary" href={api.exportUrl(scan.id, "json", language)}>{copy.exportJson}</a><a className="rs-secondary" href={api.exportUrl(scan.id, "html", language)}>{copy.exportHtml}</a><a className="rs-secondary" href={api.exportUrl(scan.id, "pdf", language)}>{copy.exportPdf}</a></div>{(scan.status === "queued" || scan.status === "running") && onCancel ? <button onClick={() => void onCancel()}>{copy.cancel}</button> : null}</div> : null}
    </section>
  );
}

function renderCodeBlock(label: string, snippet: string, toneClass = "") {
  const lines = snippet.split(/\r?\n/);

  return <div className={["rs-code-block", toneClass].filter(Boolean).join(" ")}><div className="rs-code-block-head"><span>{label}</span></div><code>{lines.map((line, index) => {
    const isActive = line.startsWith("> ");
    const normalizedLine = isActive ? line.slice(2) : line;
    const match = normalizedLine.match(/^\s*(\d+)\s*\|\s?(.*)$/);
    return <span key={`${label}-${index}`} className={`rs-code-line ${isActive ? "is-active" : ""}`.trim()}>{match ? <><b>{match[1]}</b><i>|</i><span>{match[2] || " "}</span></> : <span>{normalizedLine || " "}</span>}</span>;
  })}</code></div>;
}

function renderEvidenceList(label: string, evidence: Array<{ label: string; value: string }> | undefined) {
  if (!evidence?.length) return null;
  return <div className="rs-finding-copy rs-evidence-list">{evidence.slice(0, 4).map((item, index) => <Fragment key={`${label}-${index}`}><span>{index === 0 ? label : item.label}</span><em>{item.label}: {item.value}</em></Fragment>)}</div>;
}

function renderExplanationSourceBadge(source: AiExplanationResponse["cacheSource"] | undefined, copy: CopySet) {
  const resolved = source ?? "ai";
  const className = resolved === "db" ? "is-db" : resolved === "rule" ? "is-rule" : "is-ai";
  const label = resolved === "db" ? copy.cacheDb : resolved === "rule" ? copy.cacheRule : copy.cacheAi;
  return <b className={`rs-origin-badge ${className}`.trim()}>{label}</b>;
}
