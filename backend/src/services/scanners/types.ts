import type { Finding, Severity } from "../../../../shared/src/index.js";
import type { FileRecord } from "../../utils/file-system.js";

export interface DetectorContext {
  files: FileRecord[];
}

export interface Detector {
  name: string;
  detect(context: DetectorContext): Promise<Finding[]> | Finding[];
}

export interface ExternalScannerAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  run(repoPath: string): Promise<{
    findings: Finding[];
    details: string;
  }>;
}

export const severityScores: Record<Severity, number> = {
  low: 8,
  medium: 18,
  high: 32,
  critical: 50
};
