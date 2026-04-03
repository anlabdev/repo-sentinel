import type { DashboardResponse, RepositoryFetchMode, SaveSettingsRequest, ScanReport, SettingsResponse, UiLanguage } from "../../../shared/src/index.js";

export interface AiExplanationResponse {
  model: string;
  language: "vi" | "en";
  summary: string;
  explanation: string;
  rationale?: string;
  falsePositiveNote?: string;
  relatedSnippet?: string;
  confidence: number;
  recommendedAction: string;
  scope?: "finding" | "report";
  error?: string;
  cacheSource?: "db" | "ai" | "rule";
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ScanListItem {
  id: string;
  repoUrl: string;
  branch?: string;
  repoName: string;
  sourceMode?: "clone" | "snapshot" | "remote" | "upload";
  status: string;
  progress: number;
  currentStep?: string;
  overallScore: number;
  severityBucket: string;
  aiEscalated: boolean;
  findingsCount: number;
  totalTokens?: number;
  tokenBreakdown?: {
    aiReview: number;
    aiTriage: number;
    reportExplanation: number;
    findingExplanations: number;
    explainedFindings: number;
  };
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ status: string; timestamp: string; version: string }>("/api/health"),
  getDashboard: () => request<DashboardResponse>("/api/dashboard"),
  getSettings: () => request<SettingsResponse>("/api/settings"),
  saveSettings: (body: SaveSettingsRequest) =>
    request<SettingsResponse>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  validateOpenAi: (body: { openAiApiKey?: string; openAiModel?: string; language?: UiLanguage }) =>
    request<{ model: string; validationStatus: "missing" | "valid" | "invalid" | "unchecked"; validationMessage?: string; lastValidatedAt?: string }>("/api/settings/validate-openai", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  uploadScan: async (file: File, body: { repoName?: string; allowAi: boolean; confirmBudgetOverride?: boolean; language?: UiLanguage }) => {
    const params = new URLSearchParams();
    if (body.repoName) params.set("repoName", body.repoName);
    params.set("allowAi", body.allowAi ? "true" : "false");
    if (body.language) params.set("language", body.language);
    if (body.confirmBudgetOverride) params.set("confirmBudgetOverride", "true");
    const response = await fetch(`/api/scans/upload?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/zip",
        "X-File-Name": encodeURIComponent(file.name)
      },
      body: file
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Request failed: ${response.status}`);
    }
    return await response.json() as { id: string; status: string; startedAt: string };
  },
  createScan: (body: { repoUrl: string; branch?: string; allowAi: boolean; confirmBudgetOverride?: boolean; fetchMode?: RepositoryFetchMode; language?: UiLanguage }) =>
    request<{ id: string; status: string; startedAt: string }>("/api/scans", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  cancelScan: (id: string) =>
    request<{ ok: boolean }>(`/api/scans/${id}/cancel`, {
      method: "POST"
    }),
  deleteScan: (id: string) =>
    request<{ ok: boolean }>(`/api/scans/${id}`, {
      method: "DELETE"
    }),
  deleteAllScans: () =>
    request<{ ok: boolean; deleted: number }>("/api/scans", {
      method: "DELETE"
    }),
  listScans: () => request<ScanListItem[]>("/api/scans"),
  getScan: (id: string) => request<ScanReport>(`/api/scans/${id}`),
  streamScan: (id: string) => new EventSource(`/api/scans/${id}/stream`),
  exportUrl: (id: string, format: "json" | "html" | "pdf", language?: "vi" | "en") => `/api/scans/${id}/export/${format}${language ? `?lang=${language}` : ""}`,
  explainFinding: (scanId: string, body: { findingId?: string; language: "vi" | "en"; question?: string; force?: boolean; confirmBudgetOverride?: boolean }) =>
    request<AiExplanationResponse>(`/api/scans/${scanId}/explain`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  retryAiReview: (scanId: string, body?: { question?: string; language?: UiLanguage; confirmBudgetOverride?: boolean }) =>
    request<ScanReport>(`/api/scans/${scanId}/retry-ai`, {
      method: "POST",
      body: JSON.stringify(body ?? {})
    })
};

