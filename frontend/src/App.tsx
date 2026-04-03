import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DashboardResponse, RepositoryFetchMode, ScanReport, SettingsResponse, UiLanguage } from "../../shared/src/index.js";
import { api, type AiExplanationResponse, type ScanListItem } from "./api/client.js";

type Tab = "overview" | "scan" | "live" | "analytics" | "history" | "settings";
type IconName = "shield" | "activity" | "folder" | "scan" | "history" | "settings" | "alert" | "sparkles" | "play" | "check" | "clock" | "chevron" | "rotate" | "trash" | "close" | "save";
type SelectOption = { value: string; label: string };
type AnalyticsSort = "tokens-desc" | "tokens-asc" | "recent" | "findings-desc";
type AnalyticsFilter = "all" | "withTokens" | "aiEscalated" | "highRisk";
type CopySet = (typeof COPY)["vi"] | (typeof COPY)["en"];

type FormState = {
  repoUrl: string;
  fetchMode: RepositoryFetchMode;
  uploadFile: File | null;
  deepScan: boolean;
  allowAi: boolean;
  includeNodeModules: boolean;
};

const NAV_ITEMS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: "overview", label: "Overview", icon: "activity" },
  { id: "scan", label: "New Scan", icon: "folder" },
  { id: "live", label: "Live Scan", icon: "scan" },
  { id: "analytics", label: "Analytics", icon: "activity" },
  { id: "history", label: "History", icon: "history" },
  { id: "settings", label: "Settings", icon: "settings" }
];

const COPY = {
  vi: {
    navOverview: "Tổng quan",
    navScan: "Quét mới",
    navLive: "Quét trực tiếp",
    navAnalytics: "Thống kê",
    navHistory: "Lịch sử",
    navSettings: "Cài đặt",
    securityOperations: "Trung tâm bảo mật",
    reposScanned: "kho mã đã quét",
    lastSync: "Đồng bộ",
    justNow: "vừa xong",
    loading: "RepoSentinel đang khởi động...",
    initError: "Không thể khởi tạo ứng dụng.",
    startScanError: "Không thể bắt đầu quét kho mã.",
    newRepositoryScan: "Quét kho mã mới",
    uploadZip: "Tải file ZIP",
    uploadZipHint: "Dùng cho project private hoặc source local chưa public.",
    chooseZip: "Chọn file .zip",
    noZipSelected: "Chưa chọn file zip nào.",
    dropZipHere: "Kéo thả file .zip vào đây",
    switchRepoUrl: "Repo URL",
    switchZipUpload: "Tải ZIP",
    privateRepoName: "Tên project",
    deepScan: "Quét sâu",
    aiAnalysis: "Phân tích AI",
    includeNodeModules: "Bao gồm node_modules",
    startScan: "Bắt đầu quét",
    scanHistory: "Lịch sử quét",
    showMore: "Xem thêm",
    settings: "Cài đặt",
    riskThreshold: "Ngưỡng rủi ro",
    autoEscalate: "Tự leo thang tại",
    parallelScans: "Số lượt quét song song",
    model: "Mô hình",
    autoScanOnPush: "Tự quét khi push",
    findings: "Phát hiện",
    aiReview: "Đánh giá AI",
    noScanHistory: "Chưa có lịch sử quét",
    summary: "Tóm tắt",
    reasoning: "Lý do",
    recommendedAction: "Hướng xử lý",
    noActiveScan: "Chưa có bản quét nào",
    noFindingsYet: "Chưa có phát hiện nào",
    noSuspiciousFiles: "Chưa có tệp đáng ngờ nào",
    noFileIssues: "Không có lỗi đọc tệp",
    aiReviewOff: "Đánh giá AI đang tắt",
    fileIssues: "Lỗi tệp",
    totalSize: "Tổng dung lượng",
    textFiles: "Tệp văn bản",
    binaryLikeFiles: "Tệp nhị phân",
    totalLoc: "Tổng LOC",
    largestFiles: "Tệp lớn nhất",
    hideLargestFiles: "Ẩn cột tệp lớn nhất",
    showLargestFiles: "Hiện cột tệp lớn nhất",
    readErrors: "Lỗi đọc",
    progress: "Tiến độ",
    cancel: "Hủy",
    exportJson: "JSON",
    exportHtml: "HTML",
    exportPdf: "PDF",
    searchHistory: "Tìm kho mã / URL / nhánh",
    riskScore: "Điểm rủi ro",
    activeScans: "Bản quét đang chạy",
    highRisk: "Rủi ro cao",
    aiEscalation: "Leo thang AI",
    totalTokens: "Tổng token",
    cacheDb: "DB",
    cacheAi: "AI",
    cacheRule: "Rule",
    running: "đang chạy",
    reposScannedToday: "kho mã đã quét hôm nay",
    reposFlagged: "kho mã bị gắn cờ",
    threatsBlocked: "mối đe dọa đã chặn",
    pending: "đang chờ",
    aiAnalysisReady: "AI sẵn sàng phân tích",
    clearAll: "Xóa tất cả",
    rescan: "Quét lại",
    delete: "Xóa",
    thresholds: "Ngưỡng",
    apiKey: "Khóa API",
    scanners: "Bộ quét",
    save: "Lưu",
    saving: "Đang lưu...",
    reset: "Khôi phục",
    builtIn: "Tích hợp sẵn",
    staticAnalysis: "Phân tích tĩnh",
    dependencyScanning: "Quét phụ thuộc",
    osvDatabase: "Cơ sở dữ liệu OSV",
    patternMatching: "Khớp mẫu",
    selectedFinding: "Phát hiện đang chọn",
    detector: "Bộ phát hiện",
    ruleId: "Rule ID",
    confidence: "Độ tin cậy",
    category: "Danh mục",
    evidence: "Bằng chứng",
    falsePositive: "Lưu ý false positive",
    source: "Nguồn",
    codeContext: "Ngữ cảnh mã nguồn",
    aiPinpoint: "AI pinpoint",
    suspiciousText: "Đoạn nghi vấn",
    aiDetail: "Phân tích AI theo phát hiện",
    aiAnalyzing: "AI đang phân tích...",
    selectFindingHint: "Chọn một phát hiện để xem AI giải thích chi tiết cho đúng tệp và dấu hiệu đó.",
    retryAiDetail: "Phân tích lại",
    aiReviewLanguageMismatch: "Bản AI review này đang được lưu bằng",
    refreshAiReviewLanguage: "Phân tích lại theo ngôn ngữ hiện tại",
    aiReviewRefreshing: "Đang phân tích lại AI review...",
    analyticsTitle: "Thống kê token",
    analyticsSubtitle: "Toàn bộ project và chi tiết token theo từng pha AI.",
    project: "Project",
    totalScansLabel: "Tổng lượt quét",
    avgTokensPerScan: "Token trung bình / lượt",
    selectedScanToken: "Chi tiết token project",
    scanStatus: "Trạng thái",
    lastUpdated: "Cập nhật",
    aiReviewTokens: "AI review",
    aiTriageTokens: "AI triage",
    reportExplanationTokens: "Giải thích báo cáo",
    findingExplanationTokens: "Giải thích finding",
    explainedFindings: "Số finding đã lưu",
    noAnalyticsData: "Chưa có dữ liệu token để thống kê.",
    openLiveScan: "Mở quét trực tiếp",
    analyticsSearch: "Lọc theo project / URL / nhánh",
    analyticsSort: "Sắp xếp",
    analyticsFilter: "Lọc",
    sortTokensDesc: "Token cao nhất",
    sortTokensAsc: "Token thấp nhất",
    sortRecent: "Mới nhất",
    sortFindingsDesc: "Nhiều phát hiện nhất",
    filterAll: "Tất cả",
    filterWithTokens: "Có token",
    filterAiEscalated: "Có AI escalation",
    filterHighRisk: "Rủi ro cao",
    exportTokenCsv: "Xuất CSV token",
    categoryAll: "Tất cả nhóm",
    categoryFilter: "Lọc theo nhóm"
  },
  en: {
    navOverview: "Overview",
    navScan: "New Scan",
    navLive: "Live Scan",
    navAnalytics: "Analytics",
    navHistory: "History",
    navSettings: "Settings",
    securityOperations: "Security Operations",
    reposScanned: "repos scanned",
    lastSync: "Last sync",
    justNow: "just now",
    loading: "RepoSentinel is loading...",
    initError: "Could not initialize the app.",
    startScanError: "Could not start the scan.",
    newRepositoryScan: "New Repository Scan",
    uploadZip: "Upload ZIP",
    uploadZipHint: "Use this for private projects or local source bundles.",
    chooseZip: "Choose .zip file",
    noZipSelected: "No zip file selected.",
    dropZipHere: "Drop your .zip file here",
    switchRepoUrl: "Repo URL",
    switchZipUpload: "Upload ZIP",
    privateRepoName: "Project name",
    deepScan: "Deep scan",
    aiAnalysis: "AI analysis",
    includeNodeModules: "Include node_modules",
    startScan: "Start Scan",
    scanHistory: "Scan History",
    showMore: "Show more",
    settings: "Settings",
    riskThreshold: "Risk Threshold",
    autoEscalate: "Auto-Escalate at",
    parallelScans: "Parallel scans",
    model: "Model",
    autoScanOnPush: "Auto-scan on push",
    findings: "Findings",
    aiReview: "AI Review",
    noScanHistory: "No scan history",
    summary: "Summary",
    reasoning: "Reasoning",
    recommendedAction: "Recommended action",
    noActiveScan: "No active scan",
    noFindingsYet: "No findings yet",
    noSuspiciousFiles: "No suspicious files",
    noFileIssues: "No file read errors",
    aiReviewOff: "AI review not enabled",
    fileIssues: "File issues",
    totalSize: "Total size",
    textFiles: "Text files",
    binaryLikeFiles: "Binary-like files",
    totalLoc: "Total LOC",
    largestFiles: "Largest files",
    hideLargestFiles: "Hide largest files column",
    showLargestFiles: "Show largest files column",
    readErrors: "Read errors",
    progress: "Progress",
    cancel: "Cancel",
    exportJson: "JSON",
    exportHtml: "HTML",
    exportPdf: "PDF",
    searchHistory: "Search repository / URL / branch",
    riskScore: "Risk Score",
    activeScans: "Active scans",
    highRisk: "High risk",
    aiEscalation: "AI escalation",
    totalTokens: "Total tokens",
    cacheDb: "DB",
    cacheAi: "AI",
    cacheRule: "Rule",
    running: "running",
    reposScannedToday: "repos scanned today",
    reposFlagged: "repos flagged",
    threatsBlocked: "threats blocked",
    pending: "pending",
    aiAnalysisReady: "AI analysis ready",
    clearAll: "Clear all",
    rescan: "Rescan",
    delete: "Delete",
    thresholds: "Thresholds",
    apiKey: "API Key",
    scanners: "Scanners",
    save: "Save",
    saving: "Saving...",
    reset: "Reset",
    builtIn: "Built-in",
    staticAnalysis: "Static analysis",
    dependencyScanning: "Dependency scanning",
    osvDatabase: "OSV database",
    patternMatching: "Pattern matching",
    selectedFinding: "Selected finding",
    detector: "Detector",
    ruleId: "Rule ID",
    confidence: "Confidence",
    category: "Category",
    evidence: "Evidence",
    falsePositive: "False positive note",
    source: "Source",
    codeContext: "Code context",
    aiPinpoint: "AI pinpoint",
    suspiciousText: "Suspicious text",
    aiDetail: "AI analysis for this finding",
    aiAnalyzing: "AI is analyzing...",
    selectFindingHint: "Select a finding to see a focused AI explanation for that file and signal.",
    retryAiDetail: "Analyze again",
    aiReviewLanguageMismatch: "This AI review is currently stored in",
    refreshAiReviewLanguage: "Regenerate in current language",
    aiReviewRefreshing: "Regenerating AI review...",
    analyticsTitle: "Token analytics",
    analyticsSubtitle: "All projects and AI token breakdown by phase.",
    project: "Project",
    totalScansLabel: "Total scans",
    avgTokensPerScan: "Avg tokens / scan",
    selectedScanToken: "Project token detail",
    scanStatus: "Status",
    lastUpdated: "Updated",
    aiReviewTokens: "AI review",
    aiTriageTokens: "AI triage",
    reportExplanationTokens: "Report explanation",
    findingExplanationTokens: "Finding explanations",
    explainedFindings: "Cached findings",
    noAnalyticsData: "No token data available yet.",
    openLiveScan: "Open live scan",
    analyticsSearch: "Filter by project / URL / branch",
    analyticsSort: "Sort",
    analyticsFilter: "Filter",
    sortTokensDesc: "Highest tokens",
    sortTokensAsc: "Lowest tokens",
    sortRecent: "Most recent",
    sortFindingsDesc: "Most findings",
    filterAll: "All",
    filterWithTokens: "With tokens",
    filterAiEscalated: "AI escalated",
    filterHighRisk: "High risk",
    exportTokenCsv: "Export token CSV",
    categoryAll: "All categories",
    categoryFilter: "Filter by category"
  }
} as const;

const FETCH_MODE_OPTIONS: Record<UiLanguage, SelectOption[]> = {
  vi: [
    { value: "clone", label: "Quét đầy đủ" },
    { value: "snapshot", label: "Quét nhanh" },
    { value: "remote", label: "Chỉ khác biệt" },
    { value: "upload", label: "Tải ZIP" }
  ],
  en: [
    { value: "clone", label: "Full Scan" },
    { value: "snapshot", label: "Quick Scan" },
    { value: "remote", label: "Diff Only" },
    { value: "upload", label: "Upload ZIP" }
  ]
};

const PARALLEL_SCAN_OPTIONS: SelectOption[] = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "4", label: "4" },
  { value: "8", label: "8" }
];

const MODEL_OPTIONS: SelectOption[] = [
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-4", label: "GPT-4" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" }
];

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
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
  const [query, setQuery] = useState("");
  const [showLargestFiles, setShowLargestFiles] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("rs-show-largest-files") !== "false";
  });
  const [form, setForm] = useState<FormState>({
    repoUrl: "",
    fetchMode: "clone",
    uploadFile: null,
    deepScan: false,
    allowAi: true,
    includeNodeModules: false
  });
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [findingExplanations, setFindingExplanations] = useState<Record<string, AiExplanationResponse>>({});
  const [findingExplainLoading, setFindingExplainLoading] = useState<Record<string, boolean>>({});
  const [retryingAiReview, setRetryingAiReview] = useState(false);
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    void bootstrap();
    return () => streamRef.current?.close();
  }, []);

  const stats = useMemo(() => ({
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

  const copy = COPY[language];

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
    setFindingExplanations({});
    setFindingExplainLoading({});
    setSelectedFindingId((current) => (selectedScan?.findings.some((finding) => finding.id === current) ? current : selectedScan?.findings[0]?.id ?? null));
  }, [selectedScan]);

  useEffect(() => {
    if (!selectedScan || !selectedFindingId || findingExplanations[selectedFindingId] || findingExplainLoading[selectedFindingId]) return;
    void explainFindingDetail(selectedFindingId);
  }, [selectedScan, selectedFindingId, findingExplanations, findingExplainLoading, language]);

  async function explainFindingDetail(findingId: string, force = false) {
    if (!selectedScan) return;
    try {
      setFindingExplainLoading((current) => ({ ...current, [findingId]: true }));
      const explanation = await api.explainFinding(selectedScan.id, { findingId, language, force });
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
    setFindingExplanations((current) => { const next = { ...current }; delete next[selectedFindingId]; return next; });
    void explainFindingDetail(selectedFindingId, true);
  }

  async function retrySelectedScanAiReview() {
    if (!selectedScan) return;
    try {
      setRetryingAiReview(true);
      setError(null);
      const next = await api.retryAiReview(selectedScan.id, { language });
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

  async function openScan(id: string, switchTab = true) {
    const report = await api.getScan(id);
    setSelectedScan(report);
    if (switchTab) setTab("live");

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
  }

  async function submitScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      if (form.fetchMode === "upload" && !form.uploadFile) {
        throw new Error(language === "vi" ? "Hãy chọn file .zip trước khi quét." : "Choose a .zip file before scanning.");
      }
      const created = form.fetchMode === "upload"
        ? await api.uploadScan(form.uploadFile as File, {
            repoName: form.repoUrl.trim() || form.uploadFile?.name.replace(/\.zip$/i, ""),
            allowAi: form.allowAi,
            language
          })
        : await api.createScan({
            repoUrl: form.repoUrl,
            allowAi: form.allowAi,
            fetchMode: form.fetchMode,
            language
          });
      await refreshWorkspace();
      await openScan(created.id);
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
      const created = await api.createScan({
        repoUrl: scan.repoUrl,
        ...(scan.branch ? { branch: scan.branch } : {}),
        allowAi: scan.aiEscalated,
        fetchMode: scan.sourceMode ?? "clone",
        language
      });
      await refreshWorkspace();
      await openScan(created.id);
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
      const saved = await api.saveSettings({
        suspicionThreshold: settings.suspicionThreshold,
        enableOpenAi: settings.enableOpenAi,
        openAiModel: settings.openAiModel,
        openAiApiKey: settings.openAi.apiKeyInput?.trim() ?? "",
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

  if (loading) {
    return <div className="rs-loading">{copy.loading}</div>;
  }

  return (
    <div className="rs-shell">
      <aside className="rs-sidebar">
        <div className="rs-brand">
          <Icon name="shield" />
          <span>RepoSentinel</span>
        </div>

        <nav className="rs-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <span>
                <Icon name={item.icon} />
{navLabel(item.id, copy)}
              </span>
            </button>
          ))}
        </nav>

        <div className="rs-sidebar-footer">Engine v1.0.0</div>
      </aside>

      <main className="rs-main">
        <header className="rs-topbar">
          <div className="rs-topbar-left">
            <strong>{copy.securityOperations}</strong>
            <span>{stats.totalScanned} {copy.reposScanned}</span>
          </div>
          <div className="rs-topbar-right">
            <div className="rs-language-switch">
              <button type="button" className={language === "vi" ? "active" : ""} onClick={() => setLanguage("vi")}>VI</button>
              <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
            </div>
            <span>{copy.lastSync}: {copy.justNow}</span>
            <i />
          </div>
        </header>

        <div className={`rs-page ${tab === "live" ? "rs-page-live" : ""}`.trim()}>
          {error ? <div className="rs-error">{error}</div> : null}

          {tab === "overview" && settings ? (
            <>
              <OverviewStats stats={stats} copy={copy} />
              <ScanFormCard form={form} setForm={setForm} onSubmit={submitScan} copy={copy} language={language} />
              <div className="rs-overview-grid rs-overview-main">
                <LivePanel scan={selectedScan} copy={copy} language={language} showLargestFiles={showLargestFiles} enableCategoryFilter={false} selectedFindingId={selectedFindingId} selectedFindingExplanation={selectedFindingId ? findingExplanations[selectedFindingId] : undefined} selectedFindingLoading={selectedFindingId ? findingExplainLoading[selectedFindingId] : false} onSelectFinding={setSelectedFindingId} onRetryFindingDetail={retryFindingDetail} onRetryAiReview={retrySelectedScanAiReview} retryingAiReview={retryingAiReview} />
                <HistoryPanel scans={scans} onOpen={openScan} compact onShowMore={() => setTab("history")} copy={copy} language={language} />
              </div>
              <SettingsPanel
                settings={settings}
                saving={saving}
                isDirty={settingsDirty}
                setSettings={setSettings}
                onSubmit={saveCurrentSettings}
                onReset={resetSettings}
                onValidateAi={validateAiSettings}
                validatingAi={validatingAi}
                compact
                copy={copy}
              />
            </>
          ) : null}

          {tab === "scan" && <ScanFormCard form={form} setForm={setForm} onSubmit={submitScan} copy={copy} language={language} />}
          {tab === "live" && <LivePanel scan={selectedScan} full onCancel={cancelSelectedScan} copy={copy} language={language} showLargestFiles={showLargestFiles} enableCategoryFilter onToggleLargestFiles={() => setShowLargestFiles((current) => !current)} selectedFindingId={selectedFindingId} selectedFindingExplanation={selectedFindingId ? findingExplanations[selectedFindingId] : undefined} selectedFindingLoading={selectedFindingId ? findingExplainLoading[selectedFindingId] : false} onSelectFinding={setSelectedFindingId} onRetryFindingDetail={retryFindingDetail} onRetryAiReview={retrySelectedScanAiReview} retryingAiReview={retryingAiReview} />}
          {tab === "analytics" && <AnalyticsPanel scans={scans} selectedScan={selectedScan} onSelectScan={(id) => openScan(id, false)} onOpenLive={(id) => openScan(id, true)} copy={copy} language={language} />}
          {tab === "history" && <HistoryPanel scans={filteredScans} query={query} setQuery={setQuery} onDeleteAll={deleteAllScans} onOpen={openScan} onRescan={rescan} onDelete={deleteScan} copy={copy} language={language} />}
          {tab === "settings" && settings ? (
            <SettingsPanel
              settings={settings}
              saving={saving}
              isDirty={settingsDirty}
              setSettings={setSettings}
              onSubmit={saveCurrentSettings}
              onReset={resetSettings}
              onValidateAi={validateAiSettings}
              validatingAi={validatingAi}
              copy={copy}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function OverviewStats({ stats, copy }: { stats: { riskScore: number; activeScans: number; highRiskRepos: number; aiEscalations: number; totalTokensUsed: number; totalScanned: number; threatsBlocked: number }; copy: CopySet }) {
  const cards = [
    { key: "risk", title: copy.riskScore, value: stats.riskScore, suffix: "/100", note: "", icon: "shield" as IconName, tone: "success" },
    { key: "active", title: copy.activeScans, value: stats.activeScans, suffix: copy.running, note: `${stats.totalScanned} ${copy.reposScannedToday}`, icon: "activity" as IconName, tone: "neutral" },
    { key: "high", title: copy.highRisk, value: stats.highRiskRepos, suffix: copy.reposFlagged, note: `${stats.threatsBlocked} ${copy.threatsBlocked}`, icon: "alert" as IconName, tone: "danger" },
    { key: "ai", title: copy.aiEscalation, value: stats.aiEscalations, suffix: copy.pending, note: copy.aiAnalysisReady, icon: "sparkles" as IconName, tone: "neutral" },
    { key: "tokens", title: copy.totalTokens, value: stats.totalTokensUsed, suffix: "", note: copy.aiAnalysis, icon: "folder" as IconName, tone: "neutral" }
  ];

  return (
    <section className="rs-kpi-row">
      {cards.map((card) => (
        <article key={card.key} className={`rs-kpi-card ${card.tone} ${card.key === "risk" ? "is-risk" : ""}`}>
          <div className="rs-kpi-head">
            <span>{card.title}</span>
            <Icon name={card.icon} />
          </div>
          <div className="rs-kpi-main">
            <strong>{card.value}</strong>
            <small>{card.suffix}</small>
          </div>
          {card.key === "risk" ? <div className="rs-mini-bar"><span style={{ width: `${card.value}%` }} /></div> : null}
          {card.note ? <div className={`rs-kpi-note ${card.key}`}>{card.note}</div> : null}
        </article>
      ))}
    </section>
  );
}

function ScanFormCard({ form, setForm, onSubmit, copy, language }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; copy: CopySet; language: UiLanguage }) {
  const isUpload = form.fetchMode === "upload";
  const [dragActive, setDragActive] = useState(false);

  function setUploadFile(file: File | null) {
    setForm((current) => ({
      ...current,
      fetchMode: file ? "upload" : current.fetchMode,
      uploadFile: file,
      repoUrl: file ? file.name : current.repoUrl
    }));
  }

  function handleFetchModeChange(value: RepositoryFetchMode) {
    setForm((current) => ({
      ...current,
      fetchMode: value,
      uploadFile: value === "upload" ? current.uploadFile : null,
      repoUrl: value === "upload" ? current.repoUrl : (current.uploadFile ? "" : current.repoUrl)
    }));
  }

  return (
    <section className="rs-panel rs-panel-floating">
      <div className="rs-panel-header"><Icon name="folder" /><span>{copy.newRepositoryScan}</span></div>
      <form className="rs-scan-form" onSubmit={onSubmit}>
        <div className="rs-scan-top rs-scan-top-flex">
          <div
            className={`rs-upload-box ${dragActive ? "is-drag" : ""} ${isUpload ? "is-upload" : ""}`.trim()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file && /\.zip$/i.test(file.name)) setUploadFile(file);
            }}
          >
            {isUpload ? (
              <div className="rs-upload-value" title={form.uploadFile?.name ?? form.repoUrl}>{form.uploadFile?.name ?? (form.repoUrl || copy.noZipSelected)}</div>
            ) : (
              <input
                required
                type="url"
                value={form.repoUrl}
                placeholder={language === "vi" ? "/đường-dẫn/tới/kho-mã hoặc https://github.com/..." : "/path/to/repo or https://github.com/..."}
                onChange={(event) => setForm((current) => ({ ...current, repoUrl: event.target.value }))}
              />
            )}
            {isUpload && form.uploadFile ? (
              <button
                type="button"
                className="rs-upload-clear"
                aria-label={language === "vi" ? "Bỏ file zip" : "Clear zip file"}
                onClick={() => setForm((current) => ({ ...current, fetchMode: "clone", uploadFile: null, repoUrl: "" }))}
              >
                <Icon name="close" />
              </button>
            ) : null}
            <label className="rs-upload-trigger">
              <span>{copy.chooseZip}</span>
              <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <DropdownSelect
            value={form.fetchMode}
            options={FETCH_MODE_OPTIONS[language]}
            onChange={(value) => handleFetchModeChange(value as RepositoryFetchMode)}
          />
        </div>
        <div className="rs-scan-bottom">
          <div className="rs-checks">
            <label><input type="checkbox" checked={form.deepScan} onChange={(event) => setForm((current) => ({ ...current, deepScan: event.target.checked }))} /><span>{copy.deepScan}</span></label>
            <label><input type="checkbox" checked={form.allowAi} onChange={(event) => setForm((current) => ({ ...current, allowAi: event.target.checked }))} /><span>{copy.aiAnalysis}</span></label>
            <label><input type="checkbox" checked={form.includeNodeModules} onChange={(event) => setForm((current) => ({ ...current, includeNodeModules: event.target.checked }))} /><span>{copy.includeNodeModules}</span></label>
          </div>
          <div className="rs-grow" />
          <button className="rs-primary" type="submit"><Icon name="play" />{copy.startScan}</button>
        </div>
      </form>
    </section>
  );
}

function LivePanel({
  scan,
  full,
  onCancel,
  copy,
  language,
  showLargestFiles,
  onToggleLargestFiles,
  enableCategoryFilter,
  selectedFindingId,
  selectedFindingExplanation,
  selectedFindingLoading,
  onSelectFinding,
  onRetryFindingDetail,
  onRetryAiReview,
  retryingAiReview
}: {
  scan: ScanReport | null;
  full?: boolean;
  onCancel?: () => Promise<void>;
  copy: CopySet;
  language: UiLanguage;
  showLargestFiles: boolean;
  onToggleLargestFiles?: () => void;
  enableCategoryFilter?: boolean;
  selectedFindingId?: string | null;
  selectedFindingExplanation?: AiExplanationResponse;
  selectedFindingLoading?: boolean;
  onSelectFinding?: (findingId: string) => void;
  onRetryFindingDetail?: () => void;
  onRetryAiReview?: () => Promise<void>;
  retryingAiReview?: boolean;
}) {
  const aiDetailRef = useRef<HTMLDivElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const scanFindings = scan?.findings ?? [];
  const findingCategories = Array.from(new Set(scanFindings.map((finding) => finding.category))).sort((a, b) => a.localeCompare(b));
  const resolvedCategory = enableCategoryFilter ? activeCategory : "all";
  const visibleFindings = scanFindings.filter((finding) => resolvedCategory === "all" || finding.category === resolvedCategory);

  useEffect(() => {
    if (!full || !scan || !selectedFindingId || !aiDetailRef.current) return;
    aiDetailRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [full, scan, selectedFindingId]);

  useEffect(() => {
    if (!scan || !onSelectFinding) return;
    const firstVisibleFinding = visibleFindings[0];
    if (!firstVisibleFinding) return;
    if (!selectedFindingId || !visibleFindings.some((finding) => finding.id === selectedFindingId)) {
      onSelectFinding(firstVisibleFinding.id);
    }
  }, [onSelectFinding, scan, selectedFindingId, visibleFindings]);

  if (!scan) {
    return <section className={`rs-panel ${full ? "rs-full" : ""}`}><div className="rs-empty">{copy.noActiveScan}</div></section>;
  }

  const liveStatusIcon: IconName = scan.status === "completed" ? "check" : scan.status === "failed" ? "close" : "clock";
  const metrics = scan.metrics;
  const fileErrors = metrics?.fileErrors ?? [];
  const largestFiles = metrics?.largestFiles ?? [];
  const groupedFindings = findingCategories
    .filter((category) => resolvedCategory === "all" || category === resolvedCategory)
    .map((category) => ({ category, items: visibleFindings.filter((finding) => finding.category === category) }))
    .filter((group) => group.items.length > 0);
  const selectedFinding = visibleFindings.find((finding) => finding.id === selectedFindingId) ?? visibleFindings[0] ?? scan.findings[0];

  return (
    <section className={`rs-panel ${full ? "rs-full" : ""}`}>
      <div className="rs-live-top">
        <div className="rs-live-left">
          <span className={`rs-live-state ${scan.status}`}><Icon name={liveStatusIcon} /></span>
          <span className="rs-live-name">{scan.repoName}</span>
          <b>{statusLabel(scan.status, language)}</b>
        </div>
        <div className="rs-live-right">{full && onToggleLargestFiles ? <button type="button" className="rs-secondary rs-secondary-compact rs-live-toggle" onClick={() => onToggleLargestFiles()}>{showLargestFiles ? copy.hideLargestFiles : copy.showLargestFiles}</button> : null}<span className="rs-live-summary">{metrics?.fileCount ?? scan.runtime?.filesEnumerated ?? 0}/{metrics?.fileCount ?? scan.runtime?.filesEnumerated ?? 0} {language === "vi" ? "tệp" : "files"} {formatDuration(scan.startedAt, scan.completedAt, language)}</span></div>
      </div>
      {scan.errorMessage ? <div className="rs-live-error"><strong>{copy.fileIssues}</strong><span>{scan.errorMessage}</span></div> : null}
      <div className="rs-live-progress">
        <div className="rs-mini-bar"><span style={{ width: `${scan.progress ?? 0}%` }} /></div>
        <div className="rs-live-meta"><small>{copy.progress}: {scan.progress ?? 0}%</small><small>{scan.findings.length} {copy.findings.toLowerCase()}</small></div>
      </div>
      {metrics ? <div className="rs-live-stats-grid"><div className="rs-live-stat"><span>{copy.totalSize}</span><strong>{formatBytes(metrics.totalBytes)}</strong></div><div className="rs-live-stat"><span>{copy.textFiles}</span><strong>{metrics.textFileCount}</strong></div><div className="rs-live-stat"><span>{copy.binaryLikeFiles}</span><strong>{metrics.binaryLikeFileCount}</strong></div><div className="rs-live-stat"><span>{copy.totalLoc}</span><strong>{metrics.totalLoc}</strong></div><div className="rs-live-stat"><span>{copy.totalTokens}</span><strong>{scan.tokenUsage?.total.totalTokens ?? 0}</strong></div></div> : null}
            <div className={`rs-live-columns ${metrics ? "rs-live-columns-rich" : ""} ${showLargestFiles ? "" : "rs-live-columns-two"}`.trim()}>
        <div className="rs-live-col">
          <div className="rs-col-head"><Icon name="alert" />{copy.findings} <small>({scan.findings.length})</small></div>
          <div className="rs-live-col-body">
            {enableCategoryFilter && scan.findings.length > 0 ? <div className="rs-category-filter-shell"><span>{copy.categoryFilter}</span><div className="rs-category-filter-row"><button type="button" className={activeCategory === "all" ? "is-active" : ""} onClick={() => setActiveCategory("all")}>{copy.categoryAll}</button>{findingCategories.map((category) => <button type="button" key={category} className={activeCategory === category ? "is-active" : ""} onClick={() => setActiveCategory(category)}>{formatCategoryLabel(category, language)}</button>)}</div></div> : null}
            <OverlayScrollArea className="rs-scroll-shell" viewportClassName="rs-col-list">
              {groupedFindings.map((group) => <div className="rs-finding-group" key={group.category}><div className="rs-finding-group-head"><span>{enableCategoryFilter ? formatCategoryLabel(group.category, language) : copy.findings}</span><small>{group.items.length}</small></div>{group.items.slice(0, full ? 12 : 6).map((finding) => <button type="button" className={`rs-finding rs-finding-rich rs-finding-button ${selectedFinding?.id === finding.id ? "is-selected" : ""}`.trim()} key={finding.id} onClick={() => onSelectFinding?.(finding.id)}><b className={finding.severity}>{severityLabel(finding.severity, language)}</b><p>{finding.title}</p><small>{finding.filePath}{finding.lineNumber ? `:${finding.lineNumber}` : ""}</small><div className="rs-finding-copy"><span>{copy.ruleId}</span><em>{finding.ruleId}</em><span>{copy.category}</span><em>{formatCategoryLabel(finding.category, language)}</em><span>{copy.confidence}</span><em>{formatConfidence(finding.confidence)}</em><span>{copy.summary}</span><em>{finding.summary}</em><span>{copy.reasoning}</span><em>{finding.rationale}</em>{finding.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{finding.falsePositiveNote}</em></> : null}{finding.evidenceSnippet ? renderCodeBlock(copy.codeContext, finding.evidenceSnippet) : null}</div></button>)}</div>)}
              {visibleFindings.length === 0 ? <div className="rs-col-empty">{copy.noFindingsYet}</div> : null}
            </OverlayScrollArea>
          </div>
        </div>
        <div className="rs-live-col rs-live-col-ai">
          <div className="rs-col-head"><Icon name="sparkles" />{copy.aiReview} <b>{scan.aiReview ? (language === "vi" ? "bật" : "on") : (language === "vi" ? "tắt" : "off")}</b></div>
          <OverlayScrollArea className="rs-scroll-shell" viewportClassName="rs-ai-copy">
            {scan.aiReview ? <div className="rs-ai-sections">
              <section className="rs-ai-section">
                <div className="rs-ai-section-head">{copy.aiReview}</div>
                <p>{scan.aiReview.summary}</p>
                <div className="rs-finding-copy">
                  <span>{copy.source}</span><em>{languageLabel(scan.aiReview.language ?? "en", language)}</em>
                  <span>{copy.confidence}</span><em>{formatConfidence(scan.aiReview.confidence)}</em>
                  <span>{copy.reasoning}</span><em>{scan.aiReview.reasoningSummary}</em>
                  <span>{copy.totalTokens}</span><em>{scan.aiReview.tokenUsage?.totalTokens ?? scan.tokenUsage?.byPhase?.aiReview?.totalTokens ?? 0}</em>
                  <span>{copy.recommendedAction}</span><em>{scan.aiReview.recommendedAction}</em>
                  {scan.aiReview.falsePositiveNotes?.length ? <><span>{copy.falsePositive}</span><em>{scan.aiReview.falsePositiveNotes.join("; ")}</em></> : null}
                </div>
                {scan.aiReview.language && scan.aiReview.language !== language ? <div className="rs-ai-language-note"><span>{copy.aiReviewLanguageMismatch} <b>{languageLabel(scan.aiReview.language, language)}</b>.</span><button type="button" className="rs-secondary rs-secondary-compact" onClick={() => void onRetryAiReview?.()} disabled={retryingAiReview}>{retryingAiReview ? copy.aiReviewRefreshing : copy.refreshAiReviewLanguage}</button></div> : null}
              </section>
              <section ref={aiDetailRef} className="rs-ai-section rs-ai-detail-section">
                <div className="rs-ai-section-header">
                  <div className="rs-ai-section-head">{copy.aiDetail}</div>
                  {selectedFinding ? <button type="button" className="rs-secondary rs-secondary-compact rs-ai-retry" onClick={() => onRetryFindingDetail?.()} disabled={selectedFindingLoading}>{selectedFindingLoading ? copy.aiAnalyzing : copy.retryAiDetail}</button> : null}
                </div>
                {selectedFinding ? <div className="rs-ai-finding-detail">
                  <div className="rs-detail-card">
                    <div className="rs-finding-copy">
                      <span>{copy.selectedFinding}</span><em>{selectedFinding.title}</em>
                      <span>{copy.ruleId}</span><em>{selectedFinding.ruleId}</em>
                      <span>{copy.detector}</span><em>{selectedFinding.detector}</em>
                      <span>{copy.category}</span><em>{formatCategoryLabel(selectedFinding.category, language)}</em>
                      <span>{copy.confidence}</span><em>{formatConfidence(selectedFinding.confidence)}</em>
                      <span>File</span><em>{selectedFinding.filePath}{selectedFinding.lineNumber ? `:${selectedFinding.lineNumber}` : ""}</em>
                      <span>{copy.summary}</span><em>{selectedFinding.summary}</em>
                      <span>{copy.reasoning}</span><em>{selectedFinding.rationale}</em>
                      <span>{copy.recommendedAction}</span><em>{selectedFinding.recommendation}</em>
                      {selectedFinding.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{selectedFinding.falsePositiveNote}</em></> : null}
                    </div>
                    {renderEvidenceList(copy.evidence, selectedFinding.evidence)}
                    {selectedFinding.evidenceSnippet ? renderCodeBlock(copy.codeContext, selectedFinding.evidenceSnippet) : null}
                  </div>
                  {selectedFinding.aiTriage ? <div className="rs-detail-card rs-detail-card-ai">
                    <div className="rs-finding-copy">
                      <span>{copy.aiPinpoint}</span><em>{selectedFinding.aiTriage.summary}</em>
                      {selectedFinding.aiTriage.suspiciousLineNumber ? <><span>Line</span><em>{selectedFinding.aiTriage.suspiciousLineNumber}</em></> : null}
                      <span>{copy.confidence}</span><em>{formatConfidence(selectedFinding.aiTriage.confidence)}</em>
                      <span>{copy.reasoning}</span><em>{selectedFinding.aiTriage.rationale ?? selectedFinding.aiTriage.reasoning}</em>
                      <span>{copy.recommendedAction}</span><em>{selectedFinding.aiTriage.recommendedAction}</em>
                      {selectedFinding.aiTriage.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{selectedFinding.aiTriage.falsePositiveNote}</em></> : null}
                    </div>
                    {selectedFinding.aiTriage.suspiciousText ? renderCodeBlock(copy.suspiciousText, selectedFinding.aiTriage.suspiciousText, "rs-code-block-ai") : null}
                  </div> : null}
                  {selectedFindingLoading ? <div className="rs-col-empty">{copy.aiAnalyzing}</div> : selectedFindingExplanation ? <div className="rs-detail-card">
                    <div className="rs-finding-copy">
                      <span>{copy.summary}</span><em>{selectedFindingExplanation.summary}</em>
                      <span>{copy.reasoning}</span><em>{selectedFindingExplanation.rationale ?? selectedFindingExplanation.explanation}</em>
                      <span>{copy.confidence}</span><em>{formatConfidence(selectedFindingExplanation.confidence)}</em>
                      <span>{copy.totalTokens}</span><em>{selectedFindingExplanation.tokenUsage?.totalTokens ?? 0}</em>
                      <span>{copy.source}</span><em>{renderExplanationSourceBadge(selectedFindingExplanation.cacheSource, copy)}</em>
                      <span>{copy.recommendedAction}</span><em>{selectedFindingExplanation.recommendedAction}</em>
                      {selectedFindingExplanation.falsePositiveNote ? <><span>{copy.falsePositive}</span><em>{selectedFindingExplanation.falsePositiveNote}</em></> : null}
                      {selectedFindingExplanation.error ? <em>{selectedFindingExplanation.error}</em> : null}
                    </div>
                    {selectedFindingExplanation.relatedSnippet ? renderCodeBlock(copy.suspiciousText, selectedFindingExplanation.relatedSnippet, "rs-code-block-ai") : null}
                  </div> : <div className="rs-col-empty">{copy.selectFindingHint}</div>}
                </div> : <div className="rs-col-empty">{copy.selectFindingHint}</div>}
              </section>
            </div> : <div className="rs-col-empty">{copy.aiReviewOff}</div>}
          </OverlayScrollArea>
        </div>
        {showLargestFiles ? <div className="rs-live-col rs-live-col-files">
          <div className="rs-col-head"><Icon name="folder" />{fileErrors.length ? copy.readErrors : copy.largestFiles} <small>({fileErrors.length || largestFiles.length || scan.suspiciousFiles.length})</small></div>
          <OverlayScrollArea className="rs-scroll-shell" viewportClassName="rs-col-list">
            {fileErrors.length > 0 ? fileErrors.map((item) => <div className="rs-finding rs-finding-rich" key={`${item.path}:${item.message}`}><p>{item.path}</p><div className="rs-finding-copy"><span>{copy.fileIssues}</span><em>{item.message}</em><small>{formatBytes(item.size)}</small></div></div>) : largestFiles.length > 0 ? largestFiles.slice(0, full ? 12 : 6).map((item) => <div className="rs-suspicious rs-file-stat" key={item.path}><strong>{item.path}</strong><small>{formatBytes(item.totalBytes)}</small></div>) : scan.suspiciousFiles.length > 0 ? scan.suspiciousFiles.slice(0, full ? 12 : 6).map((item) => <div className="rs-suspicious" key={item}>{item}</div>) : <div className="rs-col-empty">{copy.noFileIssues}</div>}
          </OverlayScrollArea>
        </div> : null}
      </div>
      {full ? <div className="rs-live-actions"><div className="rs-history-actions"><a className="rs-secondary" href={api.exportUrl(scan.id, "json", language)}>{copy.exportJson}</a><a className="rs-secondary" href={api.exportUrl(scan.id, "html", language)}>{copy.exportHtml}</a><a className="rs-secondary" href={api.exportUrl(scan.id, "pdf", language)}>{copy.exportPdf}</a></div>{(scan.status === "queued" || scan.status === "running") && onCancel ? <button onClick={() => void onCancel()}>{copy.cancel}</button> : null}</div> : null}
    </section>
  );
}
function renderCodeBlock(label: string, snippet: string, toneClass = "") {
  const lines = snippet.split(/\r?\n/);

  return <div className={["rs-code-block", toneClass].filter(Boolean).join(" ")}><div className="rs-code-block-head"><span>{label}</span></div><code>{lines.map((line, index) => {
    const isActive = line.startsWith("> ");
    const normalizedLine = isActive ? line.slice(2) : line;
    const match = normalizedLine.match(/^\s*(\d+)\s*\|\s?(.*)$/);
    return <span key={`${label}-${index}`} className={`rs-code-line ${isActive ? "is-active" : ""}`.trim()}>{match ? <><b>{match[1]}</b><i>|</i><span>{match[2] || " "}</span></> : <span>{normalizedLine || " "}</span>}</span>;
  })}</code></div>;
}

function renderEvidenceList(label: string, evidence: Array<{ label: string; value: string }> | undefined) {
  if (!evidence?.length) {
    return null;
  }

  return <div className="rs-finding-copy rs-evidence-list">{evidence.slice(0, 4).map((item, index) => <Fragment key={`${label}-${index}`}><span>{index === 0 ? label : item.label}</span><em>{item.label}: {item.value}</em></Fragment>)}</div>;
}

function renderExplanationSourceBadge(source: AiExplanationResponse["cacheSource"] | undefined, copy: CopySet) {
  const resolved = source ?? "ai";
  const className = resolved === "db" ? "is-db" : resolved === "rule" ? "is-rule" : "is-ai";
  const label = resolved === "db" ? copy.cacheDb : resolved === "rule" ? copy.cacheRule : copy.cacheAi;
  return <b className={`rs-origin-badge ${className}`.trim()}>{label}</b>;
}

function formatConfidence(value?: number) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return "0%";
  return `${Math.round(normalized * 100)}%`;
}

function AnalyticsPanel({ scans, selectedScan, onSelectScan, onOpenLive, copy, language }: { scans: ScanListItem[]; selectedScan: ScanReport | null; onSelectScan: (id: string) => Promise<void>; onOpenLive: (id: string) => Promise<void>; copy: CopySet; language: UiLanguage }) {
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
              <article className="rs-analytics-stat"><span>{copy.totalScansLabel}</span><strong>{scans.length}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.totalTokens}</span><strong>{totalTokens}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.avgTokensPerScan}</span><strong>{averageTokens}</strong></article>
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
            {visibleScans.length ? <div className="rs-analytics-table">{visibleScans.map((scan) => <button key={scan.id} type="button" className={`rs-analytics-row ${activeId === scan.id ? "is-selected" : ""}`.trim()} onClick={() => void onSelectScan(scan.id)}><strong>{scan.repoName}</strong><span>{statusLabel(scan.status, language)}</span><span>{scan.findingsCount}</span><span>{scan.totalTokens ?? 0}</span><span>{formatDate(scan.completedAt ?? scan.startedAt, language)}</span></button>)}</div> : <div className="rs-empty">{copy.noAnalyticsData}</div>}
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
              <article className="rs-analytics-stat"><span>{copy.findings}</span><strong>{activeListItem.findingsCount}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.totalTokens}</span><strong>{activeListItem.totalTokens ?? selectedScan?.tokenUsage?.total.totalTokens ?? 0}</strong></article>
              <article className="rs-analytics-stat"><span>{copy.lastUpdated}</span><strong>{formatDate(activeListItem.completedAt ?? activeListItem.startedAt, language)}</strong></article>
            </div>
            <div className="rs-analytics-phase-grid">
              <article className="rs-analytics-phase"><span>{copy.aiReviewTokens}</span><strong>{breakdown?.aiReview?.totalTokens ?? activeListItem.tokenBreakdown?.aiReview ?? 0}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.aiTriageTokens}</span><strong>{breakdown?.aiTriage?.totalTokens ?? activeListItem.tokenBreakdown?.aiTriage ?? 0}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.reportExplanationTokens}</span><strong>{breakdown?.reportExplanation?.totalTokens ?? activeListItem.tokenBreakdown?.reportExplanation ?? 0}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.findingExplanationTokens}</span><strong>{findingExplanationTokens || (activeListItem.tokenBreakdown?.findingExplanations ?? 0)}</strong></article>
              <article className="rs-analytics-phase"><span>{copy.explainedFindings}</span><strong>{Object.keys(findingExplanationMap).length || (activeListItem.tokenBreakdown?.explainedFindings ?? 0)}</strong></article>
            </div>
          </div> : <div className="rs-empty">{copy.noAnalyticsData}</div>}
        </section>
      </div>
    </section>
  );
}

function HistoryPanel({ scans, query, setQuery, onDeleteAll, onOpen, onRescan, onDelete, compact, onShowMore, copy, language }: { scans: ScanListItem[]; query?: string; setQuery?: (value: string) => void; onDeleteAll?: () => Promise<void>; onOpen: (id: string) => Promise<void>; onRescan?: (scan: ScanListItem) => Promise<void>; onDelete?: (id: string) => Promise<void>; compact?: boolean; onShowMore?: () => void; copy: CopySet; language: UiLanguage }) {
  const clean = scans.filter((scan) => scan.severityBucket === "low" || scan.severityBucket === "medium").length;
  const flagged = scans.length - clean;
  const visibleScans = compact ? scans.slice(0, 5) : scans;
  const hiddenCount = compact ? Math.max(0, scans.length - visibleScans.length) : 0;

  return (
    <section className="rs-panel">
      <div className="rs-panel-header rs-panel-header-split">
        <span><Icon name="history" />{copy.scanHistory} <small>({scans.length})</small></span>
        <div className="rs-badges"><b>{clean} {language === "vi" ? "an toàn" : "clean"}</b><b className="danger">{flagged} {language === "vi" ? "bị gắn cờ" : "flagged"}</b></div>
      </div>
      {!compact && setQuery ? <div className="rs-history-toolbar"><input value={query ?? ""} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchHistory} />{onDeleteAll ? <button onClick={() => void onDeleteAll()}>{copy.clearAll}</button> : null}</div> : null}
      <OverlayScrollArea className="rs-scroll-shell rs-history-scroll" viewportClassName="rs-history-list">{visibleScans.length ? visibleScans.map((scan) => (
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
              <span>{scan.findingsCount} {copy.findings.toLowerCase()}</span>
              <span>{formatDuration(scan.startedAt, scan.completedAt)}</span>
              <span>{compact ? formatAgo(scan.completedAt ?? scan.startedAt, language) : formatDate(scan.completedAt ?? scan.startedAt, language)}</span>
            </div>
            {!compact ? <div className="rs-history-actions"><button disabled={scan.sourceMode === "upload"} title={scan.sourceMode === "upload" ? (language === "vi" ? "Tải lại file zip để quét lại" : "Upload the ZIP again to rescan") : undefined} onClick={(event) => { event.stopPropagation(); onRescan ? void onRescan(scan) : null; }}>{copy.rescan}</button><button onClick={(event) => { event.stopPropagation(); onDelete ? void onDelete(scan.id) : null; }}>{copy.delete}</button></div> : null}
          </div>
                )) : <div className="rs-empty">{copy.noScanHistory}</div>}</OverlayScrollArea>{compact && hiddenCount > 0 && onShowMore ? <button type="button" className="rs-history-more" onClick={onShowMore}>{copy.showMore} ({hiddenCount})</button> : null}</section>
  );
}

function SettingsPanel({ settings, saving, isDirty, setSettings, onSubmit, onReset, onValidateAi, validatingAi, compact, copy }: { settings: SettingsResponse; saving: boolean; isDirty: boolean; setSettings: React.Dispatch<React.SetStateAction<SettingsResponse | null>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onReset: () => void; onValidateAi: (input?: { openAiApiKey?: string; openAiModel?: string }) => Promise<void>; validatingAi: boolean; compact?: boolean; copy: CopySet }) {
  const aiReady = settings.openAi.validationStatus === "valid";
  const modelOptions = settings.openAi.availableModels.map((value) => ({ value, label: value }));
  return (
    <section className="rs-panel rs-panel-floating">
      <div className="rs-panel-header rs-panel-header-split">
        <span><Icon name="settings" />{copy.settings}</span>
        {isDirty ? <div className="rs-header-actions"><button type="button" className="rs-secondary rs-secondary-compact" onClick={onReset}><Icon name="rotate" />{copy.reset}</button><button className="rs-primary rs-primary-compact" type="submit" form="settings-form"><Icon name="save" />{saving ? copy.saving : copy.save}</button></div> : null}
      </div>
      <form id="settings-form" className={`rs-settings-grid ${compact ? "compact" : ""}`} onSubmit={onSubmit}>
        <div className="rs-settings-block">
          <h4>{copy.thresholds}</h4>
          <div className="rs-setting-line"><span>{copy.riskThreshold}</span><b>{settings.suspicionThreshold}%</b></div>
          <input type="range" min={1} max={100} value={settings.suspicionThreshold} style={{ "--range-fill": `${settings.suspicionThreshold}%` } as React.CSSProperties} onChange={(event) => setSettings((current) => current ? { ...current, suspicionThreshold: Number(event.target.value) } : current)} />
          <div className="rs-setting-line"><span>{copy.autoEscalate}</span><b>85%</b></div>
          <input type="range" min={1} max={100} value={85} style={{ "--range-fill": "85%" } as React.CSSProperties} readOnly />
          <label><span>{copy.parallelScans}</span><DropdownSelect value="4" options={PARALLEL_SCAN_OPTIONS} onChange={() => {}} compact /></label>
        </div>
        <div className="rs-settings-block">
          <h4>OpenAI</h4>
          <label className="rs-stack"><span>{copy.apiKey}</span><div className="rs-settings-inline"><input type="password" value={settings.openAi.apiKeyInput ?? ""} placeholder={settings.openAi.apiKeyPreview ?? "sk-..."} onChange={(event) => setSettings((current) => current ? { ...current, openAi: { ...current.openAi, apiKeyInput: event.target.value } } : current)} onBlur={() => { if ((settings.openAi.apiKeyInput ?? "").trim() || settings.openAi.validationStatus !== "valid") void onValidateAi({ openAiApiKey: settings.openAi.apiKeyInput, openAiModel: settings.openAiModel }); }} /><button type="button" className="rs-secondary rs-secondary-compact" onClick={() => setSettings((current) => current ? { ...current, enableOpenAi: false, openAi: { ...current.openAi, apiKeyInput: "", apiKeyPreview: undefined, validationStatus: "missing", validationMessage: "OpenAI API key is missing." } } : current)}>{copy.delete}</button></div></label>
          <label><span>{copy.model}</span><DropdownSelect value={settings.openAiModel} options={modelOptions} onChange={(value) => { setSettings((current) => current ? { ...current, openAiModel: value, openAi: { ...current.openAi, model: value } } : current); void onValidateAi({ openAiApiKey: settings.openAi.apiKeyInput, openAiModel: value }); }} compact /></label>
          <div className={`rs-setting-note ${aiReady ? "valid" : "invalid"}`.trim()}>{validatingAi ? (copy.saving) : (settings.openAi.validationMessage ?? (aiReady ? "OpenAI ready" : "OpenAI not ready"))}</div>
        </div>
        <div className="rs-settings-block">
          <h4>{copy.scanners}</h4>
          {([{ key: "builtIn", label: copy.builtIn, description: "" }, { key: "semgrep", label: "semgrep", description: copy.staticAnalysis }, { key: "trivy", label: "trivy", description: copy.dependencyScanning }, { key: "osvScanner", label: "osvScanner", description: copy.osvDatabase }, { key: "yara", label: "yara", description: copy.patternMatching }] as const).map((scanner) => <label key={scanner.key} className="rs-toggle rs-switch rs-switch-row"><span><strong>{scanner.label}</strong>{scanner.description ? <small>{scanner.description}</small> : null}</span><input type="checkbox" checked={settings.scannerToggles[scanner.key]} onChange={(event) => setSettings((current) => current ? { ...current, scannerToggles: { ...current.scannerToggles, [scanner.key]: event.target.checked } } : current)} /></label>)}
          <div className="rs-divider" />
          <label className="rs-toggle rs-switch rs-switch-row"><span><strong>{copy.aiAnalysis}</strong>{!aiReady ? <small>{settings.openAi.validationMessage ?? "OpenAI not ready"}</small> : null}</span><input type="checkbox" checked={settings.enableOpenAi && aiReady} disabled={!aiReady || validatingAi} onChange={(event) => setSettings((current) => current ? { ...current, enableOpenAi: event.target.checked } : current)} /></label>
        </div>
      </form>
    </section>
  );
}

function DropdownSelect({ value, options, onChange, compact }: { value: string; options: SelectOption[]; onChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    };
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointer);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointer);
    };
  }, [open]);

  return (
    <div className={`rs-select ${compact ? "compact" : ""}`} ref={rootRef}>
      <button type="button" className="rs-select-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label ?? ""}</span>
        <Icon name="chevron" />
      </button>
      {open && menuStyle ? createPortal(
        <div className="rs-select-menu" style={{ top: `${menuStyle.top}px`, left: `${menuStyle.left}px`, width: `${menuStyle.width}px` }}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rs-select-item ${option.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function OverlayScrollArea({ className, viewportClassName, children }: { className?: string; viewportClassName?: string; children: React.ReactNode }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ size: number; offset: number; visible: boolean }>({ size: 0, offset: 0, visible: false });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const canScroll = scrollHeight > clientHeight + 1;
      if (!canScroll) {
        setThumb({ size: 0, offset: 0, visible: false });
        return;
      }
      const ratio = clientHeight / scrollHeight;
      const size = Math.max(18, clientHeight * ratio);
      const maxOffset = Math.max(0, clientHeight - size);
      const offset = (scrollTop / Math.max(1, scrollHeight - clientHeight)) * maxOffset;
      setThumb({ size, offset, visible: true });
    };

    update();
    element.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className={`rs-scroll-area ${className ?? ""}`.trim()}>
      <div ref={viewportRef} className={`rs-scroll-viewport ${viewportClassName ?? ""}`.trim()}>{children}</div>
      {thumb.visible ? (
        <div className="rs-scrollbar">
          <div className="rs-scroll-thumb" style={{ height: `${thumb.size}px`, transform: `translateY(${thumb.offset}px)` }} />
        </div>
      ) : null}
    </div>
  );
}
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    shield: "M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z",
    activity: "M3 12h4l3-7 4 14 3-7h4",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    scan: "M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M3 15v4a2 2 0 0 0 2 2h4",
    history: "M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zm0-5.5v2m0 14v2m9-9h-2M5 12H3m15.364 6.364-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0L16.95 7.05M7.05 16.95l-1.414 1.414",
    alert: "M12 9v4M12 17h.01M10 3.5L2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L14 3.5a2 2 0 0 0-4 0z",
    sparkles: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
    play: "M8 5v14l11-7z",
    check: "M5 13l4 4L19 7",
    close: "M6 6l12 12M18 6l-12 12",
    clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z",
    chevron: "M9 18l6-6-6-6",
    rotate: "M20 11a8 8 0 1 0 2 5.3M20 4v7h-7",
    trash: "M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13",
    save: "M5 4h11l3 3v13H5zM8 4v6h8M9 20v-6h6v6"
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function statusLabel(value: string, language: UiLanguage = "en") { const copy = language === "vi" ? { queued: "đợi", running: "đang chạy", completed: "hoàn tất", failed: "thất bại", cancelled: "đã hủy" } : { queued: "queued", running: "running", completed: "complete", failed: "failed", cancelled: "cancelled" }; return copy[value as keyof typeof copy] ?? value; }
function formatDate(value?: string, language: UiLanguage = "en") { return value ? new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US") : "-"; }
function compactRepoPath(value: string) { try { const url = new URL(value); return url.pathname.replace(/^\//, "~/"); } catch { return value; } }
function formatDuration(start?: string, end?: string, language: UiLanguage = "en") { if (!start) return ""; const from = new Date(start).getTime(); const to = end ? new Date(end).getTime() : Date.now(); const seconds = Math.max(0, Math.floor((to - from) / 1000)); if (seconds < 60) return language === "vi" ? `${seconds} giây` : `${seconds}s`; const minutes = Math.floor(seconds / 60); if (minutes < 60) return language === "vi" ? `${minutes} phút` : `${minutes}m`; const hours = Math.floor(minutes / 60); return language === "vi" ? `${hours} giờ` : `${hours}h`; }
function formatBytes(value: number) { if (!Number.isFinite(value) || value <= 0) return "0 B"; const units = ["B", "KB", "MB", "GB"]; let size = value; let unit = 0; while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; } return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`; }
function historyIcon(bucket: string): IconName {
  if (bucket === "high" || bucket === "critical") return "close";
  if (bucket === "medium") return "alert";
  return "check";
}
function historyScanType(mode: string | undefined, language: UiLanguage = "en") {
  if (mode === "snapshot") return language === "vi" ? "nhanh" : "quick";
  if (mode === "remote") return language === "vi" ? "khác biệt" : "diff";
  if (mode === "upload") return language === "vi" ? "zip" : "zip";
  return language === "vi" ? "đầy đủ" : "full";
}
function severityLabel(value: string, language: UiLanguage = "en") {
  if (language !== "vi") return value;
  const labels: Record<string, string> = { low: "thấp", medium: "trung bình", high: "cao", critical: "nghiêm trọng" };
  return labels[value] ?? value;
}
function languageLabel(value: UiLanguage, language: UiLanguage = "en") {
  if (value === "vi") return language === "vi" ? "Tiếng Việt" : "Vietnamese";
  return language === "vi" ? "Tiếng Anh" : "English";
}
function formatCategoryLabel(value: string, language: UiLanguage = "en") {
  const labels = language === "vi"
    ? { secret: "Secret", "key-material": "Key material", execution: "Thực thi", "encoded-content": "Nội dung mã hóa", artifact: "Artifact", "filename-risk": "Rủi ro tên file", dependency: "Phụ thuộc", workflow: "Workflow", "config-risk": "Rủi ro cấu hình", other: "Khác" }
    : { secret: "Secret", "key-material": "Key material", execution: "Execution", "encoded-content": "Encoded content", artifact: "Artifact", "filename-risk": "Filename risk", dependency: "Dependency", workflow: "Workflow", "config-risk": "Config risk", other: "Other" };
  return labels[value as keyof typeof labels] ?? value;
}
function formatAgo(value?: string, language: UiLanguage = "en") {
  if (!value) return "-";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return language === "vi" ? `${seconds} giây trước` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return language === "vi" ? `${minutes} phút trước` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return language === "vi" ? `${hours} giờ trước` : `${hours}h ago`;
}
function navLabel(tab: Tab, copy: CopySet) {
  if (tab === "overview") return copy.navOverview;
  if (tab === "scan") return copy.navScan;
  if (tab === "live") return copy.navLive;
  if (tab === "analytics") return copy.navAnalytics;
  if (tab === "history") return copy.navHistory;
  return copy.navSettings;
}

function toMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
































