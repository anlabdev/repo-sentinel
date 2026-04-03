import type { ScanReport, UiLanguage } from "../../../shared/src/index.js";
import type { AiExplanationResponse } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import { LivePanel } from "../components/LivePanel.js";

export function LiveScanPage(props: {
  scan: ScanReport | null;
  onCancel: () => Promise<void>;
  copy: CopySet;
  language: UiLanguage;
  showLargestFiles: boolean;
  onToggleLargestFiles: () => void;
  selectedFindingId: string | null;
  selectedFindingExplanation?: AiExplanationResponse;
  selectedFindingLoading?: boolean;
  findingAllowlist: string[];
  savingAllowlistRule?: string | null;
  onSelectFinding: (id: string | null) => void;
  onRetryFindingDetail: () => void;
  onAddFindingToAllowlist: (finding: ScanReport["findings"][number]) => Promise<"added" | "exists" | "error" | "unavailable">;
  onRetryAiReview: () => Promise<void>;
  retryingAiReview: boolean;
}) {
  return <LivePanel scan={props.scan} full onCancel={props.onCancel} copy={props.copy} language={props.language} showLargestFiles={props.showLargestFiles} enableCategoryFilter onToggleLargestFiles={props.onToggleLargestFiles} selectedFindingId={props.selectedFindingId} selectedFindingExplanation={props.selectedFindingExplanation} selectedFindingLoading={props.selectedFindingLoading} findingAllowlist={props.findingAllowlist} savingAllowlistRule={props.savingAllowlistRule} onSelectFinding={(id) => props.onSelectFinding(id)} onRetryFindingDetail={props.onRetryFindingDetail} onAddFindingToAllowlist={props.onAddFindingToAllowlist} onRetryAiReview={props.onRetryAiReview} retryingAiReview={props.retryingAiReview} />;
}


