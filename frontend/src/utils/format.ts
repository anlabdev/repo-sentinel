import type { UiLanguage } from "../../../shared/src/index.js";
import type { CopySet } from "../data/ui.js";
import type { IconName, Tab } from "../types/ui.js";

export function statusLabel(value: string, language: UiLanguage = "en") {
  const copy = language === "vi"
    ? { queued: "đợi", running: "đang chạy", completed: "hoàn tất", failed: "thất bại", cancelled: "đã hủy" }
    : { queued: "queued", running: "running", completed: "complete", failed: "failed", cancelled: "cancelled" };
  return copy[value as keyof typeof copy] ?? value;
}

export function formatDate(value?: string, language: UiLanguage = "en") {
  return value ? new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US") : "-";
}

export function compactRepoPath(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.replace(/^\//, "~/");
  } catch {
    return value;
  }
}

export function formatDuration(start?: string, end?: string, language: UiLanguage = "en") {
  if (!start) return "";
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((to - from) / 1000));
  if (seconds < 60) return language === "vi" ? `${seconds} giây` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return language === "vi" ? `${minutes} phút` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return language === "vi" ? `${hours} giờ` : `${hours}h`;
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

export function historyIcon(bucket: string): IconName {
  if (bucket === "high" || bucket === "critical") return "close";
  if (bucket === "medium") return "alert";
  return "check";
}

export function historyScanType(mode: string | undefined, language: UiLanguage = "en") {
  if (mode === "snapshot") return language === "vi" ? "nhanh" : "quick";
  if (mode === "remote") return language === "vi" ? "khác biệt" : "diff";
  if (mode === "upload") return "zip";
  return language === "vi" ? "đầy đủ" : "full";
}

export function severityLabel(value: string, language: UiLanguage = "en") {
  if (language !== "vi") return value;
  const labels: Record<string, string> = { low: "thấp", medium: "trung bình", high: "cao", critical: "nghiêm trọng" };
  return labels[value] ?? value;
}

export function languageLabel(value: UiLanguage, language: UiLanguage = "en") {
  if (value === "vi") return language === "vi" ? "Tiếng Việt" : "Vietnamese";
  return language === "vi" ? "Tiếng Anh" : "English";
}

export function formatCategoryLabel(value: string, language: UiLanguage = "en") {
  const labels = language === "vi"
    ? { secret: "Secret", "key-material": "Key material", execution: "Thực thi", "encoded-content": "Nội dung mã hóa", artifact: "Artifact", "filename-risk": "Rủi ro tên file", dependency: "Phụ thuộc", workflow: "Workflow", "config-risk": "Rủi ro cấu hình", other: "Khác" }
    : { secret: "Secret", "key-material": "Key material", execution: "Execution", "encoded-content": "Encoded content", artifact: "Artifact", "filename-risk": "Filename risk", dependency: "Dependency", workflow: "Workflow", "config-risk": "Config risk", other: "Other" };
  return labels[value as keyof typeof labels] ?? value;
}

export function formatAgo(value?: string, language: UiLanguage = "en") {
  if (!value) return "-";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return language === "vi" ? `${seconds} giây trước` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return language === "vi" ? `${minutes} phút trước` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return language === "vi" ? `${hours} giờ trước` : `${hours}h ago`;
}

export function navLabel(tab: Tab, copy: CopySet) {
  if (tab === "overview") return copy.navOverview;
  if (tab === "scan") return copy.navScan;
  if (tab === "live") return copy.navLive;
  if (tab === "analytics") return copy.navAnalytics;
  if (tab === "history") return copy.navHistory;
  if (tab === "help") return copy.navHelp;
  return copy.navSettings;
}

export function formatConfidence(value?: number) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function formatNumber(value?: number) {
  return Number(value ?? 0).toLocaleString("vi-VN");
}

export function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
