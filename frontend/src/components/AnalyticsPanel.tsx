import { useMemo, useState } from "react";
import type { UiLanguage } from "../../../shared/src/index.js";
import type { ScanListItem } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import type { AnalyticsFilter, AnalyticsSort } from "../types/ui.js";
import { formatDate, formatNumber, statusLabel } from "../utils/format.js";
import { DropdownSelect } from "./DropdownSelect.js";
import { Icon } from "./Icon.js";
import { OverlayScrollArea } from "./OverlayScrollArea.js";
import type { ScanReport } from "../../../shared/src/index.js";

export function AnalyticsPanel({ scans, selectedScan, onSelectScan, onOpenLive, copy, language }: { scans: ScanListItem[]; selectedScan: ScanReport | null; onSelectScan: (id: string) => Promise<void>; onOpenLive: (id: string) => Promise<void>; copy: CopySet; language: UiLanguage }) {
  const [analyticsQuery, setAnalyticsQuery] = useState("");
  const [analyticsSort, setAnalyticsSort] = useState<AnalyticsSort>("tokens-desc");
  const [analyticsFilter, setAnalyticsFilter] = useState<AnalyticsFilter>("all");

  const totalTokens = scans.reduce((sum, scan) => sum + Number(scan.totalTokens ?? 0), 0);
  const averageTokens = scans.length ? Math.round(totalTokens / scans.length) : 0;
  const visibleScans = useMemo(() => {
    const q = analyticsQuery.trim().toLowerCase();
    const filtered = scans.filter((scan) => {
      const matchesQuery = !q || scan.repoName.toLowerCase().includes(q) || scan.repoUrl.toLowerCase().includes(q) || (scan.branch ?? "").toLowerCase().includes(q);
      if (!matchesQuery) return false;
      if (analyticsFilter === "withTokens") return Number(scan.totalTokens ?? 0) > 0;
      if (analyticsFilter === "aiEscalated") return scan.aiEscalated;
      if (analyticsFilter === "highRisk") return scan.severityBucket === "high" || scan.severityBucket === "critical";
      return true;
    });

    return filtered.sort((a, b) => {
      if (analyticsSort === "tokens-asc") return Number(a.totalTokens ?? 0) - Number(b.totalTokens ?? 0);
      if (analyticsSort === "recent") return new Date(b.completedAt ?? b.startedAt).getTime() - new Date(a.completedAt ?? a.startedAt).getTime();
      if (analyticsSort === "findings-desc") return b.findingsCount - a.findingsCount;
      return Number(b.totalTokens ?? 0) - Number(a.totalTokens ?? 0);
    });
  }, [analyticsFilter, analyticsQuery, analyticsSort, scans]);

  const activeId = visibleScans.find((scan) => scan.id === selectedScan?.id)?.id ?? visibleScans[0]?.id;
  const activeListItem = visibleScans.find((scan) => scan.id === activeId) ?? visibleScans[0];
  const breakdown = selectedScan?.id === activeId ? selectedScan?.tokenUsage?.byPhase : undefined;
  const findingExplanationMap = breakdown?.findingExplanations ?? {};
  const findingExplanationTokens = Object.values(findingExplanationMap).reduce((sum, usage) => sum + Number(usage?.totalTokens ?? 0), 0);

  function exportCsv() {
    const rows = [
      ["scanId", "repoName", "repoUrl", "branch", "status", "severityBucket", "findingsCount", "totalTokens", "aiReviewTokens", "aiTriageTokens", "reportExplanationTokens", "findingExplanationTokens", "explainedFindings", "startedAt", "completedAt"],
      ...visibleScans.map((scan) => [scan.id, scan.repoName, scan.repoUrl, scan.branch ?? "", scan.status, scan.severityBucket, String(scan.findingsCount), String(scan.totalTokens ?? 0), String(scan.tokenBreakdown?.aiReview ?? 0), String(scan.tokenBreakdown?.aiTriage ?? 0), String(scan.tokenBreakdown?.reportExplanation ?? 0), String(scan.tokenBreakdown?.findingExplanations ?? 0), String(scan.tokenBreakdown?.explainedFindings ?? 0), scan.startedAt, scan.completedAt ?? ""])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reposentinel-token-analytics.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rs-analytics-shell">
      <div className="rs-analytics-summary">
        <div className="rs-panel">
          <div className="rs-panel-header"><Icon name="activity" /><span>{copy.analyticsTitle}</span></div>
          <div className="rs-analytics-meta">
            <p>{copy.analyticsSubtitle}</p>
            <div className="rs-analytics-summary-grid">
              <article className="rs-analytics-stat"><span>{copy.totalScansLabel}</span><strong>{formatNumber(scans.length)}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.totalTokens}</span><strong>{formatNumber(totalTokens)}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.avgTokensPerScan}</span><strong>{formatNumber(averageTokens)}</strong></article>
            </div>
          </div>
        </div>
      </div>
      <div className="rs-analytics-grid">
        <section className="rs-panel">
          <div className="rs-panel-header rs-panel-header-split"><span><Icon name="folder" />{copy.project}</span><small>{visibleScans.length}</small></div>
          <div className="rs-analytics-toolbar">
            <input value={analyticsQuery} onChange={(event) => setAnalyticsQuery(event.target.value)} placeholder={copy.analyticsSearch} />
            <DropdownSelect value={analyticsSort} options={[{ value: "tokens-desc", label: copy.sortTokensDesc }, { value: "tokens-asc", label: copy.sortTokensAsc }, { value: "recent", label: copy.sortRecent }, { value: "findings-desc", label: copy.sortFindingsDesc }]} onChange={(value) => setAnalyticsSort(value as AnalyticsSort)} compact />
            <DropdownSelect value={analyticsFilter} options={[{ value: "all", label: copy.filterAll }, { value: "withTokens", label: copy.filterWithTokens }, { value: "aiEscalated", label: copy.filterAiEscalated }, { value: "highRisk", label: copy.filterHighRisk }]} onChange={(value) => setAnalyticsFilter(value as AnalyticsFilter)} compact />
            <button type="button" className="rs-secondary rs-secondary-compact" onClick={exportCsv}>{copy.exportTokenCsv}</button>
          </div>
          <OverlayScrollArea className="rs-scroll-shell rs-analytics-table-shell" viewportClassName="rs-analytics-table-body">
            {visibleScans.length ? <div className="rs-analytics-table">{visibleScans.map((scan) => <button key={scan.id} type="button" className={`rs-analytics-row ${activeId === scan.id ? "is-selected" : ""}`.trim()} onClick={() => void onSelectScan(scan.id)}><strong>{scan.repoName}</strong><span>{statusLabel(scan.status, language)}</span><span>{formatNumber(scan.findingsCount)}</span><span>{formatNumber(scan.totalTokens ?? 0)}</span><span>{formatDate(scan.completedAt ?? scan.startedAt, language)}</span></button>)}</div> : <div className="rs-empty">{copy.noAnalyticsData}</div>}
          </OverlayScrollArea>
        </section>
        <section className="rs-panel">
          <div className="rs-panel-header rs-panel-header-split"><span><Icon name="sparkles" />{copy.selectedScanToken}</span>{activeListItem ? <button type="button" className="rs-secondary rs-secondary-compact" onClick={() => void onOpenLive(activeListItem.id)}>{copy.openLiveScan}</button> : null}</div>
          {activeListItem ? <div className="rs-analytics-detail">
            <div className="rs-analytics-project-head">
              <strong>{activeListItem.repoName}</strong>
              <small>{activeListItem.repoUrl}</small>
            </div>
            <div className="rs-analytics-detail-grid">
              <article className="rs-analytics-stat"><span>{copy.scanStatus}</span><strong>{statusLabel(activeListItem.status, language)}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.findings}</span><strong>{formatNumber(activeListItem.findingsCount)}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.totalTokens}</span><strong>{formatNumber(activeListItem.totalTokens ?? selectedScan?.tokenUsage?.total.totalTokens ?? 0)}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.lastUpdated}</span><strong>{formatDate(activeListItem.completedAt ?? activeListItem.startedAt, language)}</strong></article>
            </div>
            <div className="rs-analytics-phase-grid">
              <article className="rs-analytics-phase"><span>{copy.aiReviewTokens}</span><strong>{formatNumber(breakdown?.aiReview?.totalTokens ?? activeListItem.tokenBreakdown?.aiReview ?? 0)}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.aiTriageTokens}</span><strong>{formatNumber(breakdown?.aiTriage?.totalTokens ?? activeListItem.tokenBreakdown?.aiTriage ?? 0)}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.reportExplanationTokens}</span><strong>{formatNumber(breakdown?.reportExplanation?.totalTokens ?? activeListItem.tokenBreakdown?.reportExplanation ?? 0)}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.findingExplanationTokens}</span><strong>{formatNumber(findingExplanationTokens || (activeListItem.tokenBreakdown?.findingExplanations ?? 0))}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.explainedFindings}</span><strong>{formatNumber(Object.keys(findingExplanationMap).length || (activeListItem.tokenBreakdown?.explainedFindings ?? 0))}</strong></article>
            </div>
          </div> : <div className="rs-empty">{copy.noAnalyticsData}</div>}
        </section>
      </div>
    </section>
  );
}
