import type { ScanReport, UiLanguage } from "../../../shared/src/index.js";
import type { ScanListItem } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import { AnalyticsPanel } from "../components/AnalyticsPanel.js";

export function AnalyticsPage({ scans, selectedScan, onSelectScan, onOpenLive, copy, language }: { scans: ScanListItem[]; selectedScan: ScanReport | null; onSelectScan: (id: string) => Promise<void>; onOpenLive: (id: string) => Promise<void>; copy: CopySet; language: UiLanguage }) {
  return <AnalyticsPanel scans={scans} selectedScan={selectedScan} onSelectScan={onSelectScan} onOpenLive={onOpenLive} copy={copy} language={language} />;
}
