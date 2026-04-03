export type Severity = "low" | "medium" | "high" | "critical";
export type ScanStatus = "queued" | "running" | "completed" | "failed";
export interface Finding {
    id: string;
    title: string;
    description: string;
    severity: Severity;
    scoreContribution: number;
    filePath: string;
    lineNumber?: number;
    detector: string;
    evidenceSnippet?: string;
    tags: string[];
}
export interface SeveritySummary {
    low: number;
    medium: number;
    high: number;
    critical: number;
}
export interface RiskAssessment {
    totalScore: number;
    severityBucket: Severity;
    needsAiReview: boolean;
    threshold: number;
    severitySummary: SeveritySummary;
}
export interface ExternalScannerStatus {
    name: string;
    available: boolean;
    status: "available" | "not_available" | "skipped";
    details: string;
}
export interface DependencyInsight {
    packageManager: string;
    manifestPath: string;
    suspiciousScripts: string[];
}
export interface SecretInsight {
    filePath: string;
    lineNumber?: number;
    type: string;
    preview: string;
}
export interface AiReview {
    model: string;
    summary: string;
    severity: Severity;
    confidence: number;
    recommendedAction: string;
    reasoningSummary: string;
    suggestedRules: string[];
    rawResponse?: string;
    error?: string;
}
export interface ScanReport {
    id: string;
    repoUrl: string;
    branch?: string;
    status: ScanStatus;
    progress?: number;
    currentStep?: string;
    startedAt: string;
    completedAt?: string;
    repoName: string;
    findings: Finding[];
    suspiciousFiles: string[];
    dependencies: DependencyInsight[];
    secrets: SecretInsight[];
    externalScanners: ExternalScannerStatus[];
    aiReview?: AiReview;
    aiEscalated: boolean;
    risk: RiskAssessment;
    raw: Record<string, unknown>;
    errorMessage?: string;
}
export interface ScanRequest {
    repoUrl: string;
    branch?: string;
    allowAi?: boolean;
}
export interface Settings {
    suspicionThreshold: number;
    enableOpenAi: boolean;
    scannerToggles: {
        builtIn: boolean;
        semgrep: boolean;
        trivy: boolean;
        osvScanner: boolean;
        yara: boolean;
    };
}
export interface SettingsResponse extends Settings {
    toolAvailability: ExternalScannerStatus[];
    env: {
        openAiConfigured: boolean;
        dbPath: string;
        tempDir: string;
    };
}
export interface HealthResponse {
    status: "ok";
    timestamp: string;
    version: string;
}
