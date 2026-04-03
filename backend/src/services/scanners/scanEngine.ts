import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { DependencyInsight, DetectorTiming, FileTypeStat, Finding, LargestPathStat, ScanLogEntry, ScanMetrics, ScanReport, ScanRequest, ScanTokenUsage, SecretInsight, Severity, TokenUsage } from "../../../../shared/src/index.js";
import type { AppEnv } from "../../config/env.js";
import { Database } from "../../db/database.js";
import type { OpenAiReviewService } from "../ai/openAiReviewService.js";
import type { GitService } from "../git/gitService.js";
import { buildContextSnippet, isProbablyBinary, walkFiles, type FileRecord } from "../../utils/file-system.js";
import { createId } from "../../utils/id.js";
import type { ExternalScannerRegistry } from "./externalScannerAdapters.js";
import type { Detector } from "./types.js";
import { binaryArtifactDetector } from "./detectors/binaryArtifactDetector.js";
import { encodedPayloadDetector } from "./detectors/encodedPayloadDetector.js";
import { exfiltrationDetector } from "./detectors/exfiltrationDetector.js";
import { installHooksDetector } from "./detectors/installHooksDetector.js";
import { keyMaterialDetector } from "./detectors/keyMaterialDetector.js";
import { persistenceBehaviorDetector } from "./detectors/persistenceBehaviorDetector.js";
import { secretPatternDetector } from "./detectors/secretPatternDetector.js";
import { suspiciousCommandDetector } from "./detectors/suspiciousCommandDetector.js";
import { suspiciousFilenameDetector } from "./detectors/suspiciousFilenameDetector.js";
import { workflowRiskDetector } from "./detectors/workflowRiskDetector.js";
import { normalizeFindingRecord } from "./finding-classifier.js";

interface ScanEngineDeps {
  db: Database;
  env: AppEnv;
  externalRegistry: ExternalScannerRegistry;
  gitService: GitService;
  aiService: OpenAiReviewService;
}

const detectors: Detector[] = [
  installHooksDetector,
  suspiciousCommandDetector,
  persistenceBehaviorDetector,
  exfiltrationDetector,
  encodedPayloadDetector,
  workflowRiskDetector,
  keyMaterialDetector,
  secretPatternDetector,
  suspiciousFilenameDetector,
  binaryArtifactDetector
];

const severityOrder: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export class ScanEngine {
  private readonly runningJobs = new Map<string, AbortController>();
  private readonly pendingJobs: Array<{ scanId: string; request: ScanRequest }> = [];
  private readonly events = new EventEmitter();
  private processingQueue = false;

  public constructor(private readonly deps: ScanEngineDeps) {}

  public async enqueueScan(request: ScanRequest) {
    const scanId = createId("scan");
    const startedAt = new Date().toISOString();
    await this.deps.db.createQueuedScan({
      id: scanId,
      repoUrl: request.repoUrl,
      branch: request.branch,
      repoName: request.uploadedArchive?.repoName || request.repoUrl.split("/").slice(-1)[0]?.replace(/\.git$/i, "") || "repository",
      startedAt,
      sourceMode: request.fetchMode ?? "clone"
    });

    this.pendingJobs.push({ scanId, request });
    await this.emitSnapshot(scanId);
    void this.processQueue();
    return {
      id: scanId,
      status: "queued",
      startedAt
    };
  }

  public async cancelScan(scanId: string) {
    const pendingIndex = this.pendingJobs.findIndex((job) => job.scanId === scanId);
    if (pendingIndex >= 0) {
      this.pendingJobs.splice(pendingIndex, 1);
      await this.deps.db.markScanCancelled(scanId, "Lần quét đã bị hủy trước khi bắt đầu.");
      await this.emitSnapshot(scanId);
      return true;
    }

    const controller = this.runningJobs.get(scanId);
    if (!controller) {
      return false;
    }

    controller.abort();
    return true;
  }

  public onScanUpdate(listener: (scanId: string, scan: ScanReport | null) => void) {
    this.events.on("scan-update", listener);
    return () => this.events.off("scan-update", listener);
  }

  private async processQueue() {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    try {
      const settings = await this.deps.db.getSettings();
      const maxParallel = Math.max(1, Number(settings.parallelScans ?? 4));
      while (this.runningJobs.size < maxParallel && this.pendingJobs.length > 0) {
        const next = this.pendingJobs.shift();
        if (!next) {
          break;
        }
        const controller = new AbortController();
        this.runningJobs.set(next.scanId, controller);
        void this.runScan(next.scanId, next.request, controller.signal);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private async runScan(scanId: string, request: ScanRequest, signal: AbortSignal) {
    let repoPath = "";
    let workspacePath = "";
    let files: FileRecord[] = [];
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    let lastActivityAt = Date.now();
    let cloneStuckNotified = false;
    let lastEnumerationSyncAt = 0;
    let lastEnumerationSyncedFileCount = 0;
    let sourceMode = request.fetchMode ?? "clone";
    let repoName = request.repoUrl.split("/").slice(-1)[0]?.replace(/\.git$/i, "") || "repository";
    let cloneWatcher: NodeJS.Timeout | undefined;

    try {
      const settings = await this.deps.db.getSettings();
      await this.updateProgress(scanId, 10, "Đang lấy repository", "running", {
        log: this.createLog("info", `Bắt đầu quét ${request.repoUrl}`),
        runtimePatch: {
          stuck: false,
          cloneTimedOut: false
        }
      });

      cloneWatcher = setInterval(() => {
        const idleMs = Date.now() - lastActivityAt;
        if (idleMs >= 15000 && !cloneStuckNotified) {
          cloneStuckNotified = true;
          void this.updateProgress(scanId, 10, "Đang lấy repository (đang đợi git/mạng...)", "running", {
            log: this.createLog("warn", "Bước lấy repository đang mất nhiều thời gian hơn dự kiến. Đang chờ git hoặc mạng phản hồi."),
            runtimePatch: {
              stuck: true
            }
          });
        }
      }, 5000);

      if (request.fetchMode === "remote") {
        const remote = await this.deps.gitService.fetchRemoteRepository(request.repoUrl, request.branch, {
          timeoutMs: 180000,
          signal,
          onOutput: (message, stream) => {
            lastActivityAt = Date.now();
            const compact = compactOutput(message);
            if (!compact) {
              return;
            }

            void this.updateProgress(scanId, 12, "Đang quét remote repository", "running", {
              log: this.createLog(stream === "stderr" ? "warn" : "info", `${stream}: ${compact}`),
              runtimePatch: {
                stuck: false
              }
            });
          }
        });
        clearInterval(cloneWatcher);
        cloneWatcher = undefined;
        sourceMode = "remote";
        repoName = remote.repoName;
        files = remote.files;
        await this.updateProgress(scanId, 25, "Đã nạp repository remote", "running", {
          log: this.createLog("info", `Đã nạp ${remote.files.length} tệp từ remote mà không tải source xuống local.`),
          runtimePatch: {
            stuck: false,
            filesEnumerated: remote.files.length,
            directoriesEnumerated: countDirectories(remote.files),
            textFilesRead: remote.files.filter((file) => typeof file.content === "string").length
          }
        });
      } else {
        const source = request.fetchMode === "upload" && request.uploadedArchive
          ? await this.deps.gitService.prepareUploadedArchive({
              archivePath: request.uploadedArchive.tempFilePath,
              originalName: request.uploadedArchive.originalName,
              repoName: request.uploadedArchive.repoName
            }, {
              timeoutMs: 180000,
              signal,
              onOutput: (message, stream) => {
                lastActivityAt = Date.now();
                const compact = compactOutput(message);
                if (!compact) {
                  return;
                }

                void this.updateProgress(scanId, 10, "Đang lấy repository", "running", {
                  log: this.createLog(stream === "stderr" ? "warn" : "info", `${stream}: ${compact}`),
                  runtimePatch: {
                    stuck: false
                  }
                });
              }
            })
          : await this.deps.gitService.prepareRepository(request.repoUrl, request.branch, {
              preferredMode: request.fetchMode ?? "clone",
              timeoutMs: 180000,
              signal,
              onOutput: (message, stream) => {
                lastActivityAt = Date.now();
                const compact = compactOutput(message);
                if (!compact) {
                  return;
                }

                void this.updateProgress(scanId, 10, "Đang lấy repository", "running", {
                  log: this.createLog(stream === "stderr" ? "warn" : "info", `${stream}: ${compact}`),
                  runtimePatch: {
                    stuck: false
                  }
                });
              }
            });
        clearInterval(cloneWatcher);
        cloneWatcher = undefined;
        repoPath = source.repoPath;
        workspacePath = source.workspacePath;
        sourceMode = source.mode;
        repoName = source.repoName;
        await this.updateProgress(scanId, 20, source.mode === "snapshot" ? "Đã tải snapshot repository" : source.mode === "upload" ? "Đã nạp file zip" : "Đã clone repository", "running", {
          log: this.createLog("info", source.mode === "snapshot" ? "Đã tải snapshot repository thành công." : source.mode === "upload" ? "Đã giải nén file zip thành công." : "Đã clone repository thành công."),
          runtimePatch: {
            stuck: false
          }
        });

        await this.updateProgress(scanId, 25, "Đang liệt kê tệp", "running");
        this.throwIfCancelled(signal);
        files = await walkFiles(repoPath, {
          signal,
          onProgress: async (progress) => {
            const now = Date.now();
            if (progress.filesEnumerated - lastEnumerationSyncedFileCount < 250 && now - lastEnumerationSyncAt < 800) {
              return;
            }

            lastEnumerationSyncAt = now;
            lastEnumerationSyncedFileCount = progress.filesEnumerated;
            const elapsedSeconds = Math.max((now - startedAtMs) / 1000, 1);
            await this.updateProgress(scanId, 25, `Đang liệt kê tệp (${progress.filesEnumerated} tệp)`, "running", {
              runtimePatch: {
                filesEnumerated: progress.filesEnumerated,
                directoriesEnumerated: progress.directoriesEnumerated,
                textFilesRead: progress.textFilesRead,
                currentPhaseFileCount: progress.filesEnumerated,
                throughputFilesPerSecond: Number((progress.filesEnumerated / elapsedSeconds).toFixed(1))
              }
            });
          }
        });
      }
      const metrics = collectScanMetrics(files, startedAtMs);
      await this.updateProgress(scanId, 35, "Đã liệt kê xong tệp", "running", {
        log: this.createLog("info", `Đã liệt kê ${metrics.fileCount} tệp trong ${metrics.directoryCount} thư mục.`),
        runtimePatch: {
          filesEnumerated: metrics.fileCount,
          directoriesEnumerated: metrics.directoryCount,
          textFilesRead: metrics.textFileCount,
          throughputFilesPerSecond: Number((metrics.fileCount / Math.max(metrics.durationMs / 1000, 1)).toFixed(1))
        }
      });

      await this.updateProgress(scanId, 50, "Đang chạy detector nội bộ", "running");
      let findings: Finding[] = [];
      const detectorTimings: DetectorTiming[] = [];
      if (settings.scannerToggles.builtIn) {
        for (const detector of detectors) {
          this.throwIfCancelled(signal);
          const detectorStartedAt = Date.now();
          await this.updateProgress(scanId, 50, `Đang chạy detector nội bộ (${detector.name})`, "running", {
            log: this.createLog("info", `Đang chạy detector: ${detector.name}`),
            runtimePatch: {
              currentPhaseFileCount: files.length,
              currentDetector: detector.name
            }
          });
          const detectorFindings = await detector.detect({ files });
          findings.push(...detectorFindings);
          detectorTimings.push({
            detector: detector.name,
            durationMs: Date.now() - detectorStartedAt,
            findingsCount: detectorFindings.length
          });
          await this.updateProgress(scanId, 58, `Đã chạy xong detector (${detector.name})`, "running", {
            runtimePatch: {
              detectorTimings: [...detectorTimings],
              currentDetector: undefined
            }
          });
        }
      } else {
        await this.updateProgress(scanId, 50, "Đã tắt detector nội bộ", "running", {
          log: this.createLog("warn", "Các detector nội bộ đang bị tắt trong cài đặt.")
        });
      }

      await this.updateProgress(scanId, 65, "Đang kiểm tra scanner ngoài", "running", {
        log: this.createLog("info", sourceMode === "remote" ? "Bỏ qua scanner ngoài vì không có filesystem local." : "Đang kiểm tra các adapter scanner ngoài.")
      });
      const external = sourceMode === "remote"
        ? { findings: [], statuses: this.deps.externalRegistry.buildRemoteModeStatuses(settings.scannerToggles as unknown as Record<string, boolean>) }
        : await this.deps.externalRegistry.runEnabled(repoPath, settings.scannerToggles as unknown as Record<string, boolean>);
      findings = findings.concat(external.findings);
      findings = findings.map((finding) => normalizeFindingRecord(finding));
      findings = findings.map((finding) => enrichFindingEvidence(finding, files));
      findings = dedupeFindings(findings);
      const allowlist = settings.findingAllowlist ?? [];
      const suppressedFindings = findings.filter((finding) => isAllowlistedFinding(finding, allowlist));
      findings = findings.filter((finding) => !isAllowlistedFinding(finding, allowlist));
      if (suppressedFindings.length > 0) {
        await this.updateProgress(scanId, 68, "Đã áp dụng allowlist finding", "running", {
          log: this.createLog("info", `Đã ẩn ${suppressedFindings.length} finding theo allowlist cấu hình.`)
        });
      }

      findings.sort((a, b) => b.scoreContribution - a.scoreContribution);

      const dependencies = collectDependencies(files);
      const secrets = collectSecrets(findings);
      const suspiciousFiles = [...new Set(findings.map((finding) => finding.filePath))];
      const risk = assessRisk(findings, settings.suspicionThreshold);
      const shouldEscalateToAi =
        settings.enableOpenAi &&
        request.allowAi !== false &&
        settings.openAiValidationStatus === "valid" &&
        Boolean(settings.openAiApiKey) &&
        (risk.needsAiReview || findings.some((finding) => finding.severity === "high" || finding.severity === "critical"));

      await this.updateProgress(scanId, 80, shouldEscalateToAi ? "Đang chạy đánh giá OpenAI" : "Đang hoàn tất báo cáo", "running", {
        log: this.createLog("info", shouldEscalateToAi ? "Đang gửi các phát hiện đáng nghi sang OpenAI để đánh giá sâu." : "Đã bỏ qua bước đánh giá OpenAI.")
      });
      const aiConfig = { apiKey: settings.openAiApiKey, model: settings.openAiModel };
      const aiReview = shouldEscalateToAi ? await this.deps.aiService.review({ repoUrl: request.repoUrl, findings, files, language: request.language ?? "vi" }, aiConfig) : undefined;
      const triageResult = shouldEscalateToAi ? await this.deps.aiService.triageFindings({ repoUrl: request.repoUrl, findings, files, language: request.language ?? "vi" }, aiConfig) : { triages: {}, tokenUsage: undefined };
      findings = findings.map((finding) => ({ ...finding, aiTriage: triageResult.triages[finding.id] ?? finding.aiTriage }));
      const completedAt = new Date().toISOString();
      const runtime = await this.getRuntimeSnapshot(scanId);

      const report: ScanReport = {
        id: scanId,
        repoUrl: request.repoUrl,
        branch: request.branch,
        sourceMode,
        status: "completed",
        startedAt,
        completedAt,
        repoName,
        findings,
        suspiciousFiles,
        dependencies,
        secrets,
        externalScanners: external.statuses,
        aiReview,
        aiEscalated: shouldEscalateToAi,
        risk,
        metrics,
        runtime,
        tokenUsage: buildScanTokenUsage(aiReview?.tokenUsage, triageResult.tokenUsage),
        raw: {
          fileCount: files.length,
          directoryCount: metrics.directoryCount,
          totalLines: metrics.totalLines,
          totalLoc: metrics.totalLoc,
          totalBytes: metrics.totalBytes,
          textFileCount: metrics.textFileCount,
          binaryLikeFileCount: metrics.binaryLikeFileCount,
          byExtension: metrics.byExtension,
          durationMs: metrics.durationMs,
          detectorCount: detectors.length,
          scanThreshold: settings.suspicionThreshold,
          sourceMode,
          suppressedFindings: suppressedFindings.length,
          allowlistRulesApplied: allowlist
        }
      };

      await this.deps.db.saveCompletedScan(report);
      await this.emitSnapshot(scanId);
    } catch (error) {
      if (cloneWatcher) {
        clearInterval(cloneWatcher);
      }
      const message = error instanceof Error ? error.message : "Lỗi quét không xác định";
      const cancelled = /cancelled by user/i.test(message);
      await this.updateProgress(scanId, 100, cancelled ? "Đã hủy" : "Thất bại", cancelled ? "cancelled" : "failed", {
        errorMessage: message,
        log: this.createLog(cancelled ? "warn" : "error", message),
        runtimePatch: {
          stuck: false,
          cloneTimedOut: /timed out/i.test(message),
          currentDetector: undefined
        }
      });
      if (cancelled) {
        await this.deps.db.markScanCancelled(scanId, message);
      } else {
        await this.deps.db.markScanFailed(scanId, message);
      }
      await this.emitSnapshot(scanId);
    } finally {
      this.runningJobs.delete(scanId);
      void this.processQueue();
      if (request.uploadedArchive?.tempFilePath) {
        await fs.rm(request.uploadedArchive.tempFilePath, { force: true });
      }
      if (workspacePath) {
        await fs.rm(workspacePath, { recursive: true, force: true });
      } else if (repoPath) {
        await fs.rm(repoPath, { recursive: true, force: true });
      }
    }
  }

  private async getRuntimeSnapshot(scanId: string) {
    const scan = await this.deps.db.getScanById(scanId);
    return scan?.runtime ?? {
      filesEnumerated: 0,
      directoriesEnumerated: 0,
      textFilesRead: 0,
      logs: [],
      detectorTimings: []
    };
  }

  private createLog(level: ScanLogEntry["level"], message: string): ScanLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message
    };
  }

  private async updateProgress(
    scanId: string,
    progress: number,
    currentStep: string,
    status: "queued" | "running" | "completed" | "failed" | "cancelled" = "running",
    options?: {
      runtimePatch?: Record<string, unknown>;
      log?: ScanLogEntry;
      errorMessage?: string;
    }
  ) {
    await this.deps.db.updateScanProgress(scanId, progress, currentStep, status, options);
    await this.emitSnapshot(scanId);
  }

  private throwIfCancelled(signal: AbortSignal) {
    if (signal.aborted) {
      throw new Error("Lần quét đã bị hủy bởi người dùng");
    }
  }

  private async emitSnapshot(scanId: string) {
    const scan = await this.deps.db.getScanById(scanId);
    this.events.emit("scan-update", scanId, scan);
  }
}


function buildScanTokenUsage(aiReviewUsage?: TokenUsage, aiTriageUsage?: TokenUsage): ScanTokenUsage | undefined {
  if (!aiReviewUsage && !aiTriageUsage) {
    return undefined;
  }

  const total = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const usage of [aiReviewUsage, aiTriageUsage].filter(Boolean) as TokenUsage[]) {
    total.inputTokens += Number(usage.inputTokens ?? 0);
    total.outputTokens += Number(usage.outputTokens ?? 0);
    total.totalTokens += Number(usage.totalTokens ?? 0);
  }

  return {
    total,
    byPhase: {
      aiReview: aiReviewUsage,
      aiTriage: aiTriageUsage,
      findingExplanations: {}
    }
  };
}

function collectDependencies(files: Awaited<ReturnType<typeof walkFiles>>): DependencyInsight[] {
  const insights: DependencyInsight[] = [];
  for (const file of files) {
    if (file.relativePath !== "package.json" || !file.content) {
      continue;
    }

    try {
      const parsed = JSON.parse(file.content) as { scripts?: Record<string, string> };
      const suspiciousScripts = Object.entries(parsed.scripts ?? {})
        .filter(([, value]) => /(curl|wget|powershell|Invoke-WebRequest|node\s+-e|bash\s+-c)/i.test(value))
        .map(([name, value]) => `${name}: ${value}`);

      insights.push({
        packageManager: "npm",
        manifestPath: file.relativePath,
        suspiciousScripts
      });
    } catch {
      continue;
    }
  }

  return insights;
}

function collectSecrets(findings: Finding[]): SecretInsight[] {
  return findings
    .filter((finding) => finding.category === "secret" || finding.category === "key-material" || finding.ruleId.startsWith("secret.") || finding.ruleId.startsWith("key-material."))
    .map((finding) => ({
      filePath: finding.filePath,
      lineNumber: finding.lineNumber,
      type: finding.title,
      preview: finding.evidenceSnippet ?? ""
    }));
}

function assessRisk(findings: Finding[], threshold: number) {
  const severitySummary = {
    low: findings.filter((item) => item.severity === "low").length,
    medium: findings.filter((item) => item.severity === "medium").length,
    high: findings.filter((item) => item.severity === "high").length,
    critical: findings.filter((item) => item.severity === "critical").length
  };

  const totalScore = findings.reduce((sum, item) => sum + item.scoreContribution, 0);
  const severityBucket = findings.reduce<Severity>((current, item) => {
    return severityOrder[item.severity] > severityOrder[current] ? item.severity : current;
  }, totalScore >= threshold ? "medium" : "low");

  return {
    totalScore,
    severityBucket,
    needsAiReview: totalScore >= threshold || severitySummary.high > 0 || severitySummary.critical > 0,
    threshold,
    severitySummary
  };
}

function collectScanMetrics(files: FileRecord[], startedAtMs: number): ScanMetrics {
  const directorySet = new Set<string>(["."]);
  const byExtension = new Map<string, FileTypeStat>();
  const directorySizes = new Map<string, LargestPathStat>();

  let textFileCount = 0;
  let binaryLikeFileCount = 0;
  let totalBytes = 0;
  let totalLines = 0;
  let totalLoc = 0;
  const fileErrors: ScanMetrics["fileErrors"] = [];

  for (const file of files) {
    const parent = path.posix.dirname(file.relativePath);
    directorySet.add(parent);
    totalBytes += file.size;
    const directory = directorySizes.get(parent) ?? {
      path: parent,
      totalBytes: 0,
      fileCount: 0
    };
    directory.totalBytes += file.size;
    directory.fileCount = (directory.fileCount ?? 0) + 1;
    directorySizes.set(parent, directory);

    const extension = file.extension || "[no extension]";
    const existing = byExtension.get(extension) ?? {
      extension,
      files: 0,
      textFiles: 0,
      binaryLikeFiles: 0,
      totalBytes: 0,
      totalLines: 0,
      totalLoc: 0
    };

    existing.files += 1;
    existing.totalBytes += file.size;

    if (file.readError) {
      fileErrors.push({
        path: file.relativePath,
        message: file.readError,
        size: file.size
      });
    }

    if (file.content !== undefined) {
      const lines = countLines(file.content);
      const loc = countLoc(file.content);
      textFileCount += 1;
      totalLines += lines;
      totalLoc += loc;
      existing.textFiles += 1;
      existing.totalLines += lines;
      existing.totalLoc += loc;
    } else if (isProbablyBinary(file)) {
      binaryLikeFileCount += 1;
      existing.binaryLikeFiles += 1;
    }

    byExtension.set(extension, existing);
  }

  return {
    directoryCount: directorySet.size,
    fileCount: files.length,
    textFileCount,
    binaryLikeFileCount,
    totalBytes,
    totalLines,
    totalLoc,
    durationMs: Date.now() - startedAtMs,
    byExtension: [...byExtension.values()].sort((a, b) => {
      if (b.files !== a.files) {
        return b.files - a.files;
      }

      return a.extension.localeCompare(b.extension);
    }),
    largestFiles: files
      .slice()
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((file) => ({
        path: file.relativePath,
        totalBytes: file.size
      })),
    largestDirectories: [...directorySizes.values()]
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 10),
    fileErrors
  };
}

function countLines(content: string) {
  if (!content) {
    return 0;
  }

  return content.split(/\r?\n/).length;
}

function countLoc(content: string) {
  if (!content) {
    return 0;
  }

  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .length;
}

function countDirectories(files: FileRecord[]) {
  const directories = new Set<string>(["."]);
  for (const file of files) {
    const parts = file.relativePath.split("/");
    if (parts.length <= 1) {
      continue;
    }

    let current = "";
    for (const segment of parts.slice(0, -1)) {
      current = current ? `${current}/${segment}` : segment;
      directories.add(current);
    }
  }

  return directories.size;
}

function compactOutput(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 180);
}

function selectAiReviewCandidates(findings: Finding[]) {
  return [...findings]
    .filter((finding) => finding.severity === "critical" || finding.severity === "high" || finding.scoreContribution >= 18 || finding.confidence <= 0.72)
    .sort((a, b) => {
      if (severityOrder[b.severity] !== severityOrder[a.severity]) return severityOrder[b.severity] - severityOrder[a.severity];
      if (b.scoreContribution !== a.scoreContribution) return b.scoreContribution - a.scoreContribution;
      return a.confidence - b.confidence;
    })
    .slice(0, 6);
}

function dedupeFindings(findings: Finding[]) {
  const ranked = [...findings].sort((a, b) => {
    if (severityOrder[b.severity] !== severityOrder[a.severity]) return severityOrder[b.severity] - severityOrder[a.severity];
    if (b.scoreContribution !== a.scoreContribution) return b.scoreContribution - a.scoreContribution;
    return b.confidence - a.confidence;
  });

  const strongerCoverage = new Set(
    ranked
      .filter((finding) => finding.category !== "filename-risk" && finding.severity !== "low")
      .map((finding) => finding.filePath)
  );

  const seen = new Set();
  return ranked.filter((finding) => {
    if (finding.category === "filename-risk" && strongerCoverage.has(finding.filePath)) {
      return false;
    }

    const evidence = compactEvidence(finding.evidenceSnippet ?? finding.summary);
    const family = finding.category === "encoded-content" ? "encoded-family" : finding.ruleId;
    const key = [finding.filePath, finding.lineNumber ?? 0, evidence, family].join("::");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function compactEvidence(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}

function enrichFindingEvidence(finding: Finding, files: FileRecord[]): Finding {
  if (!finding.lineNumber) {
    return finding;
  }

  const file = files.find((item) => item.relativePath === finding.filePath);
  if (!file?.content) {
    return finding;
  }

  return {
    ...finding,
    evidenceSnippet: buildContextSnippet(file.content, finding.lineNumber) || finding.evidenceSnippet
  };
}



function isAllowlistedFinding(finding: Finding, rules: string[]) {
  if (!rules.length) return false;
  return rules.some((rule) => matchesAllowlistRule(finding, rule));
}

function matchesAllowlistRule(finding: Finding, rawRule: string) {
  const rule = rawRule.trim();
  if (!rule) return false;
  const parts = rule.split("@").map((item) => item.trim()).filter(Boolean);
  return parts.every((part) => matchesAllowlistCondition(finding, part));
}

function matchesAllowlistCondition(finding: Finding, part: string) {
  const lowered = part.toLowerCase();
  if (lowered.startsWith("rule:")) return finding.ruleId.toLowerCase().includes(lowered.slice(5));
  if (lowered.startsWith("path:")) return finding.filePath.toLowerCase().includes(lowered.slice(5));
  if (lowered.startsWith("tag:")) return finding.tags.some((tag) => tag.toLowerCase().includes(lowered.slice(4)));
  if (lowered.startsWith("category:")) return String(finding.category).toLowerCase() === lowered.slice(9);
  return finding.ruleId.toLowerCase().includes(lowered) || finding.filePath.toLowerCase().includes(lowered);
}
