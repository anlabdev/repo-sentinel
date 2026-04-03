import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardResponse, Finding, SettingsResponse, UiLanguage, ScanReport } from "../../../shared/src/index.js";
import { api, type AiExplanationResponse, type ScanListItem } from "../api/client.js";
import { COPY, INITIAL_FORM_STATE } from "../data/ui.js";
import type { FormState, OverviewStatsValue } from "../types/ui.js";
import { toMessage } from "../utils/format.js";

export function useRepoSentinelApp() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState<SettingsResponse | null>(null);
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validatingAi, setValidatingAi] = useState(false);
  const [language, setLanguage] = useState<UiLanguage>(() => {
    if (typeof window === "undefined") return "vi";
    return window.localStorage.getItem("rs-language") === "en" ? "en" : "vi";
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "warning" } | null>(null);
  const [query, setQuery] = useState("");
  const [showLargestFiles, setShowLargestFiles] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("rs-show-largest-files") !== "false";
  });
  const [form, setForm] = useState<FormState>(INITIAL_FORM_STATE);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [findingExplanations, setFindingExplanations] = useState<Record<string, AiExplanationResponse>>({});
  const [findingExplainLoading, setFindingExplainLoading] = useState<Record<string, boolean>>({});
  const [retryingAiReview, setRetryingAiReview] = useState(false);
  const [savingAllowlistRule, setSavingAllowlistRule] = useState<string | null>(null);
  const [highlightedAllowlistRule, setHighlightedAllowlistRule] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const copy = COPY[language];

  useEffect(() => {
    void bootstrap();
    return () => streamRef.current?.close();
  }, []);

  const stats = useMemo<OverviewStatsValue>(() => ({
    riskScore: Math.min(100, dashboard?.latestScan?.overallScore ?? selectedScan?.risk.totalScore ?? 34),
    activeScans: dashboard?.totals.runningScans ?? 0,
    highRiskRepos: dashboard?.totals.highRiskScans ?? 0,
    aiEscalations: dashboard?.totals.escalatedScans ?? 0,
    totalTokensUsed: dashboard?.totals.totalTokensUsed ?? 0,
    totalScanned: dashboard?.totals.totalScans ?? 0,
    threatsBlocked: scans.reduce((sum, scan) => sum + scan.findingsCount, 0)
  }), [dashboard, scans, selectedScan]);

  const filteredScans = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scans;
    return scans.filter((scan) => scan.repoName.toLowerCase().includes(q) || scan.repoUrl.toLowerCase().includes(q) || (scan.branch ?? "").toLowerCase().includes(q));
  }, [query, scans]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rs-language", language);
    }
    setFindingExplanations({});
    setFindingExplainLoading({});
  }, [language]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rs-show-largest-files", showLargestFiles ? "true" : "false");
    }
  }, [showLargestFiles]);

  useEffect(() => {
    if (!notice || typeof window === "undefined") return;
    const timer = window.setTimeout(() => setNotice((current) => current?.message === notice.message ? null : current), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setFindingExplanations({});
    setFindingExplainLoading({});
    setSelectedFindingId((current) => (selectedScan?.findings.some((finding) => finding.id === current) ? current : selectedScan?.findings[0]?.id ?? null));
  }, [selectedScan]);

  useEffect(() => {
    if (!selectedScan || !selectedFindingId || findingExplanations[selectedFindingId] || findingExplainLoading[selectedFindingId]) return;
    void explainFindingDetail(selectedFindingId);
  }, [selectedScan, selectedFindingId, findingExplanations, findingExplainLoading, language]);

  async function explainFindingDetail(findingId: string, force = false, confirmBudgetOverride = false) {
    if (!selectedScan) return;
    try {
      setFindingExplainLoading((current) => ({ ...current, [findingId]: true }));
      const explanation = await api.explainFinding(selectedScan.id, { findingId, language, force, confirmBudgetOverride });
      setFindingExplanations((current) => ({ ...current, [findingId]: explanation }));
    } catch (err) {
      setFindingExplanations((current) => ({
        ...current,
        [findingId]: {
          model: "unavailable",
          language,
          summary: language === "vi" ? "Chưa thể lấy phân tích AI cho phát hiện này." : "Could not load AI analysis for this finding.",
          explanation: language === "vi" ? "Hãy thử lại sau hoặc kiểm tra cấu hình OpenAI." : "Try again later or verify the OpenAI configuration.",
          confidence: 0,
          recommendedAction: language === "vi" ? "Xem lại thủ công finding này trước khi xử lý tiếp." : "Review this finding manually before proceeding.",
          scope: "finding",
          error: toMessage(err, language === "vi" ? "Yêu cầu AI thất bại." : "AI request failed.")
        }
      }));
    } finally {
      setFindingExplainLoading((current) => ({ ...current, [findingId]: false }));
    }
  }

  function retryFindingDetail() {
    if (!selectedFindingId) return;
    const confirmBudgetOverride = settings?.openAi.budget.status !== "ok";
    if (confirmBudgetOverride && !confirmAiBudgetUsage()) {
      setFindingExplanations((current) => ({
        ...current,
        [selectedFindingId]: {
          model: "unavailable",
          language,
          summary: copy.aiDisabledForThisAction,
          explanation: copy.aiDisabledForThisAction,
          confidence: 0,
          recommendedAction: language === "vi" ? "Tiếp tục xem finding theo luật định sẵn hoặc tăng budget token nếu cần AI." : "Continue with deterministic review or raise the AI token budget if you need AI.",
          scope: "finding"
        }
      }));
      return;
    }
    setFindingExplanations((current) => {
      const next = { ...current };
      delete next[selectedFindingId];
      return next;
    });
    void explainFindingDetail(selectedFindingId, true, confirmBudgetOverride);
  }

  async function retrySelectedScanAiReview() {
    if (!selectedScan) return;
    try {
      setRetryingAiReview(true);
      setError(null);
      const confirmBudgetOverride = settings?.openAi.budget.status !== "ok";
      if (confirmBudgetOverride && !confirmAiBudgetUsage()) {
        setError(copy.aiDisabledForThisAction);
        return;
      }
      const next = await api.retryAiReview(selectedScan.id, { language, confirmBudgetOverride });
      setSelectedScan(next);
      await refreshWorkspace();
    } catch (err) {
      setError(toMessage(err, language === "vi" ? "Không thể phân tích lại AI review theo ngôn ngữ hiện tại." : "Could not regenerate the AI review in the current language."));
    } finally {
      setRetryingAiReview(false);
    }
  }

  const settingsDirty = useMemo(() => {
    if (!settings || !savedSettingsSnapshot) return false;
    return JSON.stringify(settings) !== JSON.stringify(savedSettingsSnapshot);
  }, [settings, savedSettingsSnapshot]);

  function confirmAiBudgetUsage() {
    if (!settings?.enableOpenAi) return true;
    const budget = settings.openAi.budget;
    if (budget.status === "ok") return true;
    const message = budget.status === "exceeded" ? copy.aiBudgetConfirmExceeded : copy.aiBudgetConfirmWarning;
    return typeof window === "undefined" ? false : window.confirm(message);
  }

  async function bootstrap() {
    try {
      setLoading(true);
      setError(null);
      const [dashboardResponse, settingsResponse, scansResponse] = await Promise.all([
        api.getDashboard(),
        api.getSettings(),
        api.listScans()
      ]);
      setDashboard(dashboardResponse);
      setSettings(settingsResponse);
      setSavedSettingsSnapshot(settingsResponse);
      setScans(scansResponse);
      if (dashboardResponse.latestScan?.id) {
        await openScan(dashboardResponse.latestScan.id, false);
      }
    } catch (err) {
      setError(toMessage(err, copy.initError));
    } finally {
      setLoading(false);
    }
  }

  async function refreshWorkspace() {
    const [dashboardResponse, scansResponse] = await Promise.all([api.getDashboard(), api.listScans()]);
    setDashboard(dashboardResponse);
    setScans(scansResponse);
  }

  async function openScan(id: string, switchTab?: boolean) {
    const report = await api.getScan(id);
    setSelectedScan(report);

    streamRef.current?.close();
    if (report.status === "queued" || report.status === "running") {
      const source = api.streamScan(id);
      streamRef.current = source;
      source.addEventListener("scan", async (event) => {
        const next = JSON.parse((event as MessageEvent).data) as ScanReport;
        setSelectedScan(next);
        await refreshWorkspace();
        if (["completed", "failed", "cancelled"].includes(next.status)) {
          source.close();
          streamRef.current = null;
        }
      });
      source.onerror = () => {
        source.close();
        streamRef.current = null;
      };
    }
    return switchTab ?? true;
  }

  async function submitScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      if (form.fetchMode === "upload" && !form.uploadFile) {
        throw new Error(language === "vi" ? "Hãy chọn file .zip trước khi quét." : "Choose a .zip file before scanning.");
      }
      let allowAi = form.allowAi;
      const confirmBudgetOverride = allowAi && settings?.openAi.budget.status !== "ok";
      if (confirmBudgetOverride && !confirmAiBudgetUsage()) {
        allowAi = false;
        setError(copy.aiDisabledForThisAction);
      }
      const created = form.fetchMode === "upload"
        ? await api.uploadScan(form.uploadFile as File, {
            repoName: form.repoUrl.trim() || form.uploadFile?.name.replace(/\.zip$/i, ""),
            allowAi,
            confirmBudgetOverride: allowAi && confirmBudgetOverride,
            language
          })
        : await api.createScan({
            repoUrl: form.repoUrl,
            allowAi,
            confirmBudgetOverride: allowAi && confirmBudgetOverride,
            fetchMode: form.fetchMode,
            language
          });
      await refreshWorkspace();
      await openScan(created.id, true);
    } catch (err) {
      setError(toMessage(err, copy.startScanError));
    }
  }

  async function rescan(scan: ScanListItem) {
    if (scan.sourceMode === "upload") {
      setError(language === "vi" ? "Bản quét từ file zip không thể quét lại tự động. Hãy tải file zip lên lại ở màn Quét mới." : "ZIP-based scans cannot be rescanned automatically. Please upload the ZIP again from New Scan.");
      return;
    }
    try {
      setError(null);
      let allowAi = scan.aiEscalated;
      const confirmBudgetOverride = allowAi && settings?.openAi.budget.status !== "ok";
      if (confirmBudgetOverride && !confirmAiBudgetUsage()) {
        allowAi = false;
        setError(copy.aiDisabledForThisAction);
      }
      const created = await api.createScan({
        repoUrl: scan.repoUrl,
        ...(scan.branch ? { branch: scan.branch } : {}),
        allowAi,
        confirmBudgetOverride: allowAi && confirmBudgetOverride,
        fetchMode: scan.sourceMode ?? "clone",
        language
      });
      await refreshWorkspace();
      await openScan(created.id, true);
    } catch (err) {
      setError(toMessage(err, language === "vi" ? "Không thể quét lại kho mã này." : "Could not rescan this repository."));
    }
  }

  async function deleteScan(id: string) {
    await api.deleteScan(id);
    if (selectedScan?.id === id) setSelectedScan(null);
    await refreshWorkspace();
  }

  async function deleteAllScans() {
    await api.deleteAllScans();
    setSelectedScan(null);
    await refreshWorkspace();
  }

  async function cancelSelectedScan() {
    if (!selectedScan) return;
    await api.cancelScan(selectedScan.id);
    await refreshWorkspace();
    await openScan(selectedScan.id, false);
  }

  async function validateAiSettings(input?: { openAiApiKey?: string; openAiModel?: string }) {
    if (!settings) return;
    try {
      setValidatingAi(true);
      const result = await api.validateOpenAi({
        openAiApiKey: input?.openAiApiKey,
        openAiModel: input?.openAiModel ?? settings.openAiModel,
        language
      });
      setSettings((current) => current ? ({
        ...current,
        openAiModel: result.model,
        enableOpenAi: result.validationStatus === "valid" ? current.enableOpenAi : false,
        openAi: {
          ...current.openAi,
          model: result.model,
          validationStatus: result.validationStatus,
          validationMessage: result.validationMessage,
          lastValidatedAt: result.lastValidatedAt,
          apiKeyInput: input?.openAiApiKey ?? current.openAi.apiKeyInput ?? ""
        }
      }) : current);
    } catch (err) {
      setError(toMessage(err, language === "vi" ? "Không thể kiểm tra OpenAI API key." : "Could not validate the OpenAI API key."));
      setSettings((current) => current ? ({
        ...current,
        enableOpenAi: false,
        openAi: {
          ...current.openAi,
          validationStatus: "invalid",
          validationMessage: toMessage(err, language === "vi" ? "OpenAI API key không hợp lệ." : "The OpenAI API key is invalid."),
          apiKeyInput: input?.openAiApiKey ?? current.openAi.apiKeyInput ?? ""
        }
      }) : current);
    } finally {
      setValidatingAi(false);
    }
  }

  async function saveCurrentSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      const apiKeyInput = settings.openAi.apiKeyInput;
      const saved = await api.saveSettings({
        suspicionThreshold: settings.suspicionThreshold,
        enableOpenAi: settings.enableOpenAi,
        openAiModel: settings.openAiModel,
        parallelScans: settings.parallelScans,
        scanRetentionLimit: settings.scanRetentionLimit,
        aiTokenLimit: settings.aiTokenLimit,
        aiTokenWarningPercent: settings.aiTokenWarningPercent,
        findingAllowlist: settings.findingAllowlist,
        openAiApiKey: apiKeyInput === undefined ? undefined : apiKeyInput.trim(),
        scannerToggles: settings.scannerToggles
      });
      setSettings(saved);
      setSavedSettingsSnapshot(saved);
      await refreshWorkspace();
    } catch (err) {
      setError(toMessage(err, language === "vi" ? "Không thể lưu cài đặt OpenAI." : "Could not save OpenAI settings."));
    } finally {
      setSaving(false);
    }
  }

  function resetSettings() {
    setSettings(savedSettingsSnapshot);
  }

  function buildFindingAllowlistRule(finding: Finding) {
    return `rule:${finding.ruleId}@path:${finding.filePath}`;
  }

  async function addFindingToAllowlist(finding: Finding) {
    if (!settings) return "unavailable" as const;
    const nextRule = buildFindingAllowlistRule(finding);
    if (settings.findingAllowlist.includes(nextRule)) {
      setHighlightedAllowlistRule(nextRule);
      setNotice({ message: copy.addToAllowlistExists, tone: "warning" });
      return "exists" as const;
    }

    try {
      setSavingAllowlistRule(nextRule);
      setError(null);
      const saved = await api.saveSettings({
        suspicionThreshold: settings.suspicionThreshold,
        enableOpenAi: settings.enableOpenAi,
        openAiModel: settings.openAiModel,
        parallelScans: settings.parallelScans,
        scanRetentionLimit: settings.scanRetentionLimit,
        aiTokenLimit: settings.aiTokenLimit,
        aiTokenWarningPercent: settings.aiTokenWarningPercent,
        findingAllowlist: [...settings.findingAllowlist, nextRule],
        openAiApiKey: settings.openAi.apiKeyInput?.trim() ? settings.openAi.apiKeyInput.trim() : undefined,
        scannerToggles: settings.scannerToggles
      });
      setSettings(saved);
      setSavedSettingsSnapshot(saved);
      setHighlightedAllowlistRule(nextRule);
      setNotice({ message: copy.addToAllowlistSaved, tone: "success" });
      return "added" as const;
    } catch (err) {
      setError(toMessage(err, language === "vi" ? "Không thể lưu allowlist cho finding này." : "Could not save an allowlist rule for this finding."));
      return "error" as const;
    } finally {
      setSavingAllowlistRule(null);
    }
  }

  return {
    dashboard,
    settings,
    setSettings,
    savedSettingsSnapshot,
    scans,
    selectedScan,
    loading,
    saving,
    validatingAi,
    language,
    setLanguage,
    error,
    setError,
    notice,
    query,
    setQuery,
    showLargestFiles,
    setShowLargestFiles,
    form,
    setForm,
    selectedFindingId,
    setSelectedFindingId,
    findingExplanations,
    findingExplainLoading,
    retryingAiReview,
    savingAllowlistRule,
    highlightedAllowlistRule,
    copy,
    stats,
    filteredScans,
    settingsDirty,
    refreshWorkspace,
    openScan,
    submitScan,
    rescan,
    deleteScan,
    deleteAllScans,
    cancelSelectedScan,
    validateAiSettings,
    saveCurrentSettings,
    resetSettings,
    addFindingToAllowlist,
    buildFindingAllowlistRule,
    retryFindingDetail,
    retrySelectedScanAiReview
  };
}







