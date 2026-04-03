import type { UiLanguage } from "../../../shared/src/index.js";
import type { ScanListItem } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import { compactRepoPath, formatAgo, formatDate, formatDuration, formatNumber, historyIcon, historyScanType } from "../utils/format.js";
import { Icon } from "./Icon.js";
import { OverlayScrollArea } from "./OverlayScrollArea.js";

export function HistoryPanel({ scans, query, setQuery, onDeleteAll, onOpen, onRescan, onDelete, compact, onShowMore, copy, language }: { scans: ScanListItem[]; query?: string; setQuery?: (value: string) => void; onDeleteAll?: () => Promise<void>; onOpen: (id: string) => Promise<void>; onRescan?: (scan: ScanListItem) => Promise<void>; onDelete?: (id: string) => Promise<void>; compact?: boolean; onShowMore?: () => void; copy: CopySet; language: UiLanguage }) {
  const clean = scans.filter((scan) => scan.severityBucket === "low" || scan.severityBucket === "medium").length;
  const flagged = scans.length - clean;
  const visibleScans = compact ? scans.slice(0, 5) : scans;
  const hiddenCount = compact ? Math.max(0, scans.length - visibleScans.length) : 0;

  return (
    <section className={`rs-panel ${compact ? "" : "rs-history-panel-full"}`.trim()}>
      <div className="rs-panel-header rs-panel-header-split">
        <span><Icon name="history" />{copy.scanHistory} <small>({formatNumber(scans.length)})</small></span>
        <div className="rs-badges"><b>{formatNumber(clean)} {language === "vi" ? "an toàn" : "clean"}</b><b className="danger">{formatNumber(flagged)} {language === "vi" ? "bị gắn cờ" : "flagged"}</b></div>
      </div>
      {!compact && setQuery ? <div className="rs-history-toolbar"><input value={query ?? ""} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchHistory} />{onDeleteAll ? <button onClick={() => void onDeleteAll()}>{copy.clearAll}</button> : null}</div> : null}
      <OverlayScrollArea className="rs-scroll-shell rs-history-scroll" viewportClassName="rs-history-list">
        {visibleScans.length ? visibleScans.map((scan) => (
          <div className="rs-history-row" key={scan.id} onClick={() => void onOpen(scan.id)}>
            <div className={`rs-history-status ${scan.severityBucket}`}><Icon name={historyIcon(scan.severityBucket)} /></div>
            <div className="rs-history-main">
              <div className="rs-history-title">
                <strong>{scan.repoName}</strong>
                <b>{historyScanType(scan.sourceMode, language)}</b>
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
