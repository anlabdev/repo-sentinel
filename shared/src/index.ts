export type Severity = "low" | "medium" | "high" | "critical";
export type ScanStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type RepositoryFetchMode = "clone" | "snapshot" | "remote" | "upload";
export type UiLanguage = "vi" | "en";
export type FindingCategory =
  | "secret"
  | "key-material"
  | "execution"
  | "encoded-content"
  | "artifact"
  | "filename-risk"
  | "dependency"
  | "workflow"
  | "config-risk"
  | "other";

export interface FindingEvidence {
  kind: "snippet" | "decoded" | "pattern" | "path" | "metadata";
  label: string;
  value: string;
}

export interface FindingAiTriage {
  summary: string;
  suspiciousLineNumber?: number;
  suspiciousText?: string;
  reasoning: string;
  rationale?: string;
  confidence: number;
  recommendedAction: string;
  falsePositiveNote?: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  summary: string;
  rationale: string;
  recommendation: string;
  falsePositiveNote?: string;
  severity: Severity;
  confidence: number;
  category: FindingCategory | string;
  scoreContribution: number;
  filePath: string;
  lineNumber?: number;
  relatedLineNumbers?: number[];
  matchCount?: number;
  detector: string;
  evidenceSnippet?: string;
  tags: string[];
  evidence: FindingEvidence[];
  aiTriage?: FindingAiTriage;
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

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ScanTokenUsage {
  total: TokenUsage;
  byPhase?: {
    aiReview?: TokenUsage;
    aiTriage?: TokenUsage;
    reportExplanation?: TokenUsage;
    findingExplanations?: Record<string, TokenUsage>;
  };
}

export interface AiReviewFindingSummary {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: number;
  filePath: string;
  summary: string;
}

export interface AiReview {
  model: string;
  language?: UiLanguage;
  summary: string;
  severity: Severity;
  confidence: number;
  recommendedAction: string;
  reasoningSummary: string;
  falsePositiveNotes?: string[];
  keyFindings?: AiReviewFindingSummary[];
  suggestedRules: string[];
  rawResponse?: string;
  error?: string;
  tokenUsage?: TokenUsage;
}

export interface AiExplanation {
  model: string;
  language: UiLanguage;
  summary: string;
  explanation: string;
  rationale?: string;
  falsePositiveNote?: string;
  relatedSnippet?: string;
  confidence: number;
  recommendedAction: string;
  scope?: "finding" | "report";
  rawResponse?: string;
  error?: string;
  tokenUsage?: TokenUsage;
  cacheSource?: "db" | "ai" | "rule";
}

export interface FileTypeStat {
  extension: string;
  files: number;
  textFiles: number;
  binaryLikeFiles: number;
  totalBytes: number;
  totalLines: number;
  totalLoc: number;
}

export interface LargestPathStat {
  path: string;
  totalBytes: number;
  fileCount?: number;
}

export interface FileErrorStat {
  path: string;
  message: string;
  size: number;
}

export interface DetectorTiming {
  detector: string;
  durationMs: number;
  findingsCount: number;
}

export interface ScanMetrics {
  directoryCount: number;
  fileCount: number;
  textFileCount: number;
  binaryLikeFileCount: number;
  totalBytes: number;
  totalLines: number;
  totalLoc: number;
  durationMs: number;
  byExtension: FileTypeStat[];
  largestFiles: LargestPathStat[];
  largestDirectories: LargestPathStat[];
  fileErrors: FileErrorStat[];
}

export interface ScanLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ScanRuntime {
  filesEnumerated: number;
  directoriesEnumerated: number;
  textFilesRead: number;
  throughputFilesPerSecond?: number;
  currentPhaseFileCount?: number;
  currentDetector?: string;
  cloneTimedOut?: boolean;
  stuck?: boolean;
  lastActivityAt?: string;
  logs: ScanLogEntry[];
  detectorTimings: DetectorTiming[];
}

export interface ScanReport {
  id: string;
  repoUrl: string;
  branch?: string;
  sourceMode?: RepositoryFetchMode;
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
  metrics?: ScanMetrics;
  runtime?: ScanRuntime;
  tokenUsage?: ScanTokenUsage;
  raw: Record<string, unknown>;
  errorMessage?: string;
}

export interface ScanRequest {
  repoUrl: string;
  branch?: string;
  allowAi?: boolean;
  confirmBudgetOverride?: boolean;
  fetchMode?: RepositoryFetchMode;
  language?: UiLanguage;
  uploadedArchive?: {
    tempFilePath: string;
    originalName: string;
    repoName: string;
  };
}

export type OpenAiValidationStatus = "missing" | "valid" | "invalid" | "unchecked";

export interface Settings {
  suspicionThreshold: number;
  enableOpenAi: boolean;
  openAiModel: string;
  parallelScans: number;
  scanRetentionLimit: number;
  aiTokenLimit: number;
  aiTokenWarningPercent: number;
  findingAllowlist: string[];
  scannerToggles: {
    builtIn: boolean;
    semgrep: boolean;
    trivy: boolean;
    osvScanner: boolean;
    yara: boolean;
  };
}

export interface SaveSettingsRequest extends Settings {
  openAiApiKey?: string;
}

export interface OpenAiBudgetState {
  limitTokens: number;
  warningPercent: number;
  usedTokens: number;
  remainingTokens: number;
  status: "ok" | "warning" | "exceeded";
  warningMessage?: string;
}

export interface OpenAiSettingsState {
  configured: boolean;
  model: string;
  validationStatus: OpenAiValidationStatus;
  validationMessage?: string;
  lastValidatedAt?: string;
  apiKeyPreview?: string;
  apiKeyInput?: string;
  availableModels: string[];
  budget: OpenAiBudgetState;
}

export interface SettingsResponse extends Settings {
  toolAvailability: ExternalScannerStatus[];
  openAi: OpenAiSettingsState;
  env: {
    openAiConfigured: boolean;
    dbPath: string;
    tempDir: string;
  };
}

export interface DashboardResponse {
  totals: {
    totalScans: number;
    completedScans: number;
    runningScans: number;
    escalatedScans: number;
    highRiskScans: number;
    totalTokensUsed: number;
  };
  latestScan?: {
    id: string;
    repoName: string;
    repoUrl: string;
    branch?: string;
    status: ScanStatus;
    severityBucket: Severity;
    overallScore: number;
    findingsCount: number;
    startedAt: string;
    completedAt?: string;
  };
  severityDistribution: SeveritySummary;
  detectorCoverage: Array<{
    detector: string;
    findingsCount: number;
  }>;
  recentActivity: Array<{
    id: string;
    repoName: string;
    status: ScanStatus;
    severityBucket: Severity;
    findingsCount: number;
    startedAt: string;
  }>;
}

export interface HealthResponse {
  status: "ok";
  timestamp: string;
  version: string;
}

