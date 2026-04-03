import { useState } from "react";
import { AppShell } from "./components/AppShell.js";
import { Icon } from "./components/Icon.js";
import { useRepoSentinelApp } from "./hooks/useRepoSentinelApp.js";
import { AnalyticsPage } from "./pages/AnalyticsPage.js";
import { HelpPage } from "./pages/HelpPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { LiveScanPage } from "./pages/LiveScanPage.js";
import { NewScanPage } from "./pages/NewScanPage.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import type { Tab } from "./types/ui.js";

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const app = useRepoSentinelApp();

  const selectedFindingExplanation = app.selectedFindingId ? app.findingExplanations[app.selectedFindingId] : undefined;
  const selectedFindingLoading = app.selectedFindingId ? app.findingExplainLoading[app.selectedFindingId] : false;

  async function openScan(id: string, switchTab = true) {
    await app.openScan(id, switchTab);
    if (switchTab) setTab("live");
  }

  if (app.loading) {
    return <div className="rs-loading">{app.copy.loading}</div>;
  }

  return (
    <AppShell
      tab={tab}
      setTab={setTab}
      language={app.language}
      setLanguage={app.setLanguage}
      copy={app.copy}
      totalScanned={app.stats.totalScanned}
      scans={app.scans}
      onOpenScanCommand={(id) => openScan(id, true)}
    >
      <div className={`rs-page ${tab === "live" ? "rs-page-live" : ""} ${tab === "history" ? "rs-page-history" : ""}`.trim()}>
        {app.error ? <div className="rs-error">{app.error}</div> : null}
        {app.notice ? <div className={`rs-toast is-${app.notice.tone}`.trim()}><Icon name={app.notice.tone === "success" ? "check" : "alert"} /><span>{app.notice.message}</span></div> : null}

        {tab === "overview" && app.settings ? (
          <OverviewPage
            stats={app.stats}
            form={app.form}
            setForm={app.setForm}
            onSubmit={app.submitScan}
            selectedScan={app.selectedScan}
            scans={app.scans}
            settings={app.settings}
            saving={app.saving}
            settingsDirty={app.settingsDirty}
            setSettings={app.setSettings}
            saveCurrentSettings={app.saveCurrentSettings}
            resetSettings={app.resetSettings}
            validateAiSettings={app.validateAiSettings}
            validatingAi={app.validatingAi}
            copy={app.copy}
            language={app.language}
            showLargestFiles={app.showLargestFiles}
            findingAllowlist={app.settings?.findingAllowlist ?? []}
            savingAllowlistRule={app.savingAllowlistRule}
            selectedFindingId={app.selectedFindingId}
            selectedFindingExplanation={selectedFindingExplanation}
            selectedFindingLoading={selectedFindingLoading}
            setSelectedFindingId={app.setSelectedFindingId}
            retryFindingDetail={app.retryFindingDetail}
            addFindingToAllowlist={app.addFindingToAllowlist}
            retrySelectedScanAiReview={app.retrySelectedScanAiReview}
            retryingAiReview={app.retryingAiReview}
            openScan={openScan}
            goHistory={() => setTab("history")}
          />
        ) : null}

        {tab === "scan" ? <NewScanPage form={app.form} setForm={app.setForm} onSubmit={app.submitScan} copy={app.copy} language={app.language} /> : null}
        {tab === "live" ? <LiveScanPage scan={app.selectedScan} onCancel={app.cancelSelectedScan} copy={app.copy} language={app.language} showLargestFiles={app.showLargestFiles} onToggleLargestFiles={() => app.setShowLargestFiles((current) => !current)} findingAllowlist={app.settings?.findingAllowlist ?? []} savingAllowlistRule={app.savingAllowlistRule} selectedFindingId={app.selectedFindingId} selectedFindingExplanation={selectedFindingExplanation} selectedFindingLoading={selectedFindingLoading} onSelectFinding={app.setSelectedFindingId} onRetryFindingDetail={app.retryFindingDetail} onAddFindingToAllowlist={app.addFindingToAllowlist} onRetryAiReview={app.retrySelectedScanAiReview} retryingAiReview={app.retryingAiReview} /> : null}
        {tab === "analytics" ? <AnalyticsPage scans={app.scans} selectedScan={app.selectedScan} onSelectScan={(id) => openScan(id, false)} onOpenLive={(id) => openScan(id, true)} copy={app.copy} language={app.language} /> : null}
        {tab === "history" ? <HistoryPage scans={app.filteredScans} query={app.query} setQuery={app.setQuery} onDeleteAll={app.deleteAllScans} onOpen={openScan} onRescan={app.rescan} onDelete={app.deleteScan} copy={app.copy} language={app.language} /> : null}
        {tab === "settings" && app.settings ? <SettingsPage settings={app.settings} saving={app.saving} settingsDirty={app.settingsDirty} setSettings={app.setSettings} saveCurrentSettings={app.saveCurrentSettings} resetSettings={app.resetSettings} validateAiSettings={app.validateAiSettings} validatingAi={app.validatingAi} highlightedAllowlistRule={app.highlightedAllowlistRule} copy={app.copy} /> : null}
        {tab === "help" ? <HelpPage copy={app.copy} language={app.language} /> : null}
      </div>
    </AppShell>
  );
}





