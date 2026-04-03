import { useMemo, useState } from "react";
import type { UiLanguage } from "../../../shared/src/index.js";
import type { ScanListItem } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import { compactRepoPath, formatAgo, formatDate, formatDuration, formatNumber, historyIcon, historyScanType } from "../utils/format.js";
import { DropdownSelect } from "./DropdownSelect.js";
import { Icon } from "./Icon.js";
import { OverlayScrollArea } from "./OverlayScrollArea.js";

type HistoryFilter = "all" | "ai" | "zip" | "repo" | "flagged" | "clean";
type HistorySort = "recent" | "risk" | "findings" | "tokens";

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

function getSeverityRank(bucket: string) {
  return SEVERITY_RANK[bucket] ?? 0;
}

export function HistoryPanel({ scans, query, setQuery, onDeleteAll, onOpen, onRescan, onDelete, compact, onShowMore, copy, language }: { scans: ScanListItem[]; query?: string; setQuery?: (value: string) => void; onDeleteAll?: () => Promise<void>; onOpen: (id: string) => Promise<void>; onRescan?: (scan: ScanListItem) => Promise<void>; onDelete?: (id: string) => Promise<void>; compact?: boolean; onShowMore?: () => void; copy: CopySet; language: UiLanguage }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [sort, setSort] = useState<HistorySort>("recent");

  const clean = scans.filter((scan) => scan.severityBucket === "low" || scan.severityBucket === "medium").length;
  const flagged = scans.length - clean;

  const filterOptions = [
    { value: "all", label: copy.historyFilterAll },
    { value: "ai", label: copy.historyFilterAi },
    { value: "zip", label: copy.historyFilterZip },
    { value: "repo", label: copy.historyFilterRepo },
    { value: "flagged", label: copy.historyFilterFlagged },
    { value: "clean", label: copy.historyFilterClean }
  ];

  const sortOptions = [
    { value: "recent", label: copy.historySortRecent },
    { value: "risk", label: copy.historySortRisk },
    { value: "findings", label: copy.historySortFindings },
    { value: "tokens", label: copy.historySortTokens }
  ];

  const processedScans = useMemo(() => {
    const next = scans.filter((scan) => {
      switch (filter) {
        case "ai":
          return scan.aiEscalated;
        case "zip":
          return scan.sourceMode === "upload";
        case "repo":
          return scan.sourceMode !== "upload";
        case "flagged":
          return getSeverityRank(scan.severityBucket) >= 3;
        case "clean":
          return scan.severityBucket === "low" || scan.severityBucket === "medium";
        default:
          return true;
      }
    });

    next.sort((left, right) => {
      if (sort === "risk") {
        return getSeverityRank(right.severityBucket) - getSeverityRank(left.severityBucket) || right.overallScore - left.overallScore;
      }
      if (sort === "findings") {
        return right.findingsCount - left.findingsCount || (getSeverityRank(right.severityBucket) - getSeverityRank(left.severityBucket));
      }
      if (sort === "tokens") {
        return (right.totalTokens ?? 0) - (left.totalTokens ?? 0) || right.findingsCount - left.findingsCount;
      }
      return new Date(right.completedAt ?? right.startedAt).getTime() - new Date(left.completedAt ?? left.startedAt).getTime();
    });

    return next;
  }, [filter, scans, sort]);

  const visibleScans = compact ? processedScans.slice(0, 5) : processedScans;
  const hiddenCount = compact ? Math.max(0, processedScans.length - visibleScans.length) : 0;

  return (
    <section className={`rs-panel ${compact ? "" : "rs-history-panel-full"}`.trim()}>
      <div className="rs-panel-header rs-panel-header-split">
        <span><Icon name="history" />{copy.scanHistory} <small>({formatNumber(scans.length)})</small></span>
        <div className="rs-badges"><b>{formatNumber(clean)} {language === "vi" ? "an toàn" : "clean"}</b><b className="danger">{formatNumber(flagged)} {language === "vi" ? "bị gắn cờ" : "flagged"}</b></div>
      </div>
      {!compact && setQuery ? (
        <div className="rs-history-toolbar rs-history-toolbar-rich">
          <input value={query ?? ""} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchHistory} />
          <DropdownSelect value={sort} options={sortOptions} onChange={(value) => setSort(value as HistorySort)} compact />
          <DropdownSelect value={filter} options={filterOptions} onChange={(value) => setFilter(value as HistoryFilter)} compact />
          {onDeleteAll ? <button onClick={() => void onDeleteAll()}>{copy.clearAll}</button> : null}
        </div>
      ) : null}
      <OverlayScrollArea className="rs-scroll-shell rs-history-scroll" viewportClassName="rs-history-list">
        {visibleScans.length ? visibleScans.map((scan) => (
          <div className="rs-history-row" key={scan.id} onClick={() => void onOpen(scan.id)}>
            <div className={`rs-history-status ${scan.severityBucket}`}><Icon name={historyIcon(scan.severityBucket)} /></div>
            <div className="rs-history-main">
              <div className="rs-history-title">
                <strong>{scan.repoName}</strong>
                <b>{historyScanType(scan.sourceMode, language)}</b>
                {scan.aiEscalated ? <i className="rs-history-chip is-ai">AI</i> : null}
                {typeof scan.totalTokens === "number" && scan.totalTokens > 0 ? <i className="rs-history-chip is-token">{formatNumber(scan.totalTokens)} tok</i> : null}
              </div>
              <span>{compact ? compactRepoPath(scan.repoUrl) : scan.repoUrl}</span>
            </div>
            <div className="rs-history-stats">
              <span>{formatNumber(scan.findingsCount)} {copy.findings.toLowerCase()}</span>
              <span>{formatDuration(scan.startedAt, scan.completedAt)}</span>
              <span>{compact ? formatAgo(scan.completedAt ?? scan.startedAt, language) : formatDate(scan.completedAt ?? scan.startedAt, language)}</span>
            </div>
            {!compact ? <div className="rs-history-actions"><button disabled={scan.sourceMode === "upload"} title={scan.sourceMode === "upload" ? (language === "vi" ? "Tải lại file zip để quét lại" : "Upload the ZIP again to rescan") : undefined} onClick={(event) => { event.stopPropagation(); onRescan ? void onRescan(scan) : null; }}>{copy.rescan}</button><button onClick={(event) => { event.stopPropagation(); onDelete ? void onDelete(scan.id) : null; }}>{copy.delete}</button></div> : null}
          </div>
        )) : <div className="rs-empty">{copy.noScanHistory}</div>}
      </OverlayScrollArea>
      {compact && hiddenCount > 0 && onShowMore ? <button type="button" className="rs-history-more" onClick={onShowMore}>{copy.showMore} ({formatNumber(hiddenCount)})</button> : null}
    </section>
  );
}
