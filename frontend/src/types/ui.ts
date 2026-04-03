import type { RepositoryFetchMode } from "../../../shared/src/index.js";

export type Tab = "overview" | "scan" | "live" | "analytics" | "history" | "settings";

export type IconName =
  | "shield"
  | "activity"
  | "folder"
  | "scan"
  | "history"
  | "settings"
  | "alert"
  | "sparkles"
  | "play"
  | "check"
  | "clock"
  | "chevron"
  | "rotate"
  | "trash"
  | "close"
  | "save";

export type SelectOption = { value: string; label: string };

export type AnalyticsSort = "tokens-desc" | "tokens-asc" | "recent" | "findings-desc";
export type AnalyticsFilter = "all" | "withTokens" | "aiEscalated" | "highRisk";

export type FormState = {
  repoUrl: string;
  fetchMode: RepositoryFetchMode;
  uploadFile: File | null;
  deepScan: boolean;
  allowAi: boolean;
  includeNodeModules: boolean;
};

export type OverviewStatsValue = {
  riskScore: number;
  activeScans: number;
  highRiskRepos: number;
  aiEscalations: number;
  totalTokensUsed: number;
  totalScanned: number;
  threatsBlocked: number;
};
