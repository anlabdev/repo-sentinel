import type { SettingsResponse, UiLanguage, ScanReport } from "../../../shared/src/index.js";
import type { AiExplanationResponse, ScanListItem } from "../api/client.js";
import type { CopySet } from "../data/ui.js";
import type { FormState, OverviewStatsValue } from "../types/ui.js";
import { HistoryPanel } from "../components/HistoryPanel.js";
import { LivePanel } from "../components/LivePanel.js";
import { OverviewStats } from "../components/OverviewStats.js";
import { ScanFormCard } from "../components/ScanFormCard.js";
import { SettingsPanel } from "../components/SettingsPanel.js";

export function OverviewPage(props: {
  stats: OverviewStatsValue;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  selectedScan: ScanReport | null;
  scans: ScanListItem[];
  settings: SettingsResponse;
  saving: boolean;
  settingsDirty: boolean;
  setSettings: React.Dispatch<React.SetStateAction<SettingsResponse | null>>;
  saveCurrentSettings: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  resetSettings: () => void;
  validateAiSettings: (input?: { openAiApiKey?: string; openAiModel?: string }) => Promise<void>;
  validatingAi: boolean;
  copy: CopySet;
  language: UiLanguage;
  showLargestFiles: boolean;
  selectedFindingId: string | null;
  selectedFindingExplanation?: AiExplanationResponse;
  selectedFindingLoading?: boolean;
  setSelectedFindingId: (id: string | null) => void;
  retryFindingDetail: () => void;
  retrySelectedScanAiReview: () => Promise<void>;
  retryingAiReview: boolean;
  openScan: (id: string, switchTab?: boolean) => Promise<unknown>;
  goHistory: () => void;
}) {
  const { stats, form, setForm, onSubmit, selectedScan, scans, settings, saving, settingsDirty, setSettings, saveCurrentSettings, resetSettings, validateAiSettings, validatingAi, copy, language, showLargestFiles, selectedFindingId, selectedFindingExplanation, selectedFindingLoading, setSelectedFindingId, retryFindingDetail, retrySelectedScanAiReview, retryingAiReview, openScan, goHistory } = props;

  return (
    <>
      <OverviewStats stats={stats} copy={copy} />
      <ScanFormCard form={form} setForm={setForm} onSubmit={onSubmit} copy={copy} language={language} />
      <div className="rs-overview-grid rs-overview-main">
        <LivePanel scan={selectedScan} copy={copy} language={language} showLargestFiles={showLargestFiles} enableCategoryFilter={false} selectedFindingId={selectedFindingId} selectedFindingExplanation={selectedFindingExplanation} selectedFindingLoading={selectedFindingLoading} onSelectFinding={(id) => setSelectedFindingId(id)} onRetryFindingDetail={retryFindingDetail} onRetryAiReview={retrySelectedScanAiReview} retryingAiReview={retryingAiReview} />
        <HistoryPanel scans={scans} onOpen={(id) => openScan(id, true) as Promise<void>} compact onShowMore={goHistory} copy={copy} language={language} />
      </div>
      <SettingsPanel settings={settings} saving={saving} isDirty={settingsDirty} setSettings={setSettings} onSubmit={saveCurrentSettings} onReset={resetSettings} onValidateAi={validateAiSettings} validatingAi={validatingAi} compact copy={copy} />
    </>
  );
}
