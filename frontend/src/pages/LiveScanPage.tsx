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
  onSelectFinding: (id: string | null) => void;
  onRetryFindingDetail: () => void;
  onRetryAiReview: () => Promise<void>;
  retryingAiReview: boolean;
}) {
  return <LivePanel scan={props.scan} full onCancel={props.onCancel} copy={props.copy} language={props.language} showLargestFiles={props.showLargestFiles} enableCategoryFilter onToggleLargestFiles={props.onToggleLargestFiles} selectedFindingId={props.selectedFindingId} selectedFindingExplanation={props.selectedFindingExplanation} selectedFindingLoading={props.selectedFindingLoading} onSelectFinding={(id) => props.onSelectFinding(id)} onRetryFindingDetail={props.onRetryFindingDetail} onRetryAiReview={props.onRetryAiReview} retryingAiReview={props.retryingAiReview} />;
}
