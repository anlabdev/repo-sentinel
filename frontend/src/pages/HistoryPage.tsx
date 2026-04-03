import type { UiLanguage } from "../../../shared/src/index.js";
import type { ScanListItem } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import { HistoryPanel } from "../components/HistoryPanel.js";

export function HistoryPage(props: { scans: ScanListItem[]; query: string; setQuery: (value: string) => void; onDeleteAll: () => Promise<void>; onOpen: (id: string) => Promise<void>; onRescan: (scan: ScanListItem) => Promise<void>; onDelete: (id: string) => Promise<void>; copy: CopySet; language: UiLanguage }) {
  return <HistoryPanel scans={props.scans} query={props.query} setQuery={props.setQuery} onDeleteAll={props.onDeleteAll} onOpen={props.onOpen} onRescan={props.onRescan} onDelete={props.onDelete} copy={props.copy} language={props.language} />;
}
