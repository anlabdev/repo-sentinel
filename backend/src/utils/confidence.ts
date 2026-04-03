export const CONFIDENCE_TEXT_MAP = {
  low: 0.35,
  medium: 0.65,
  high: 0.85,
  critical: 0.95
} as const;

export type ConfidenceText = keyof typeof CONFIDENCE_TEXT_MAP;

export function normalizeConfidenceValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1) {
      return Math.max(0, Math.min(1, value / 100));
    }
    return Math.max(0, Math.min(1, value));
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return Math.max(0, Math.min(1, fallback));
    }

    if (normalized in CONFIDENCE_TEXT_MAP) {
      return CONFIDENCE_TEXT_MAP[normalized as ConfidenceText];
    }

    const parsed = Number.parseFloat(normalized.replace(/%$/, ""));
    if (Number.isFinite(parsed)) {
      return parsed > 1 ? Math.max(0, Math.min(1, parsed / 100)) : Math.max(0, Math.min(1, parsed));
    }
  }

  return Math.max(0, Math.min(1, fallback));
}
