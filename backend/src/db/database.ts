import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AiExplanation, OpenAiValidationStatus, ScanLogEntry, ScanReport, ScanTokenUsage, Settings, Severity, TokenUsage, UiLanguage } from "../../../shared/src/index.js";
import { normalizeConfidenceValue } from "../utils/confidence.js";
import { normalizeFindingCategory } from "../services/scanners/finding-classifier.js";

export interface StoredSettings extends Settings {
  openAiApiKey?: string;
  openAiValidationStatus: OpenAiValidationStatus;
  openAiValidationMessage?: string;
  openAiLastValidatedAt?: string;
}

function createDefaultSettings(env: { openAiModel?: string }): StoredSettings {
  return {
    suspicionThreshold: 60,
    enableOpenAi: false,
    openAiModel: env.openAiModel ?? "gpt-4.1-mini",
    openAiApiKey: undefined,
    openAiValidationStatus: "missing",
    openAiValidationMessage: "OpenAI API key is not configured.",
    openAiLastValidatedAt: undefined,
    scannerToggles: {
      builtIn: true,
      semgrep: true,
      trivy: true,
      osvScanner: true,
      yara: true
    }
  };
}

type RowValue = string | number | null | boolean | Record<string, unknown>;

export class Database {
  private db: DatabaseSync;

  public constructor(private readonly env: { dbPath: string; openAiModel?: string }) {
    this.db = new DatabaseSync(":memory:");
  }

  public async initialize() {
    await fs.mkdir(path.dirname(this.env.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.env.dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        repo_url TEXT NOT NULL,
        branch TEXT,
        repo_name TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        current_step TEXT,
        overall_score INTEGER NOT NULL DEFAULT 0,
        severity_bucket TEXT NOT NULL DEFAULT 'low',
        ai_escalated INTEGER NOT NULL DEFAULT 0,
        findings_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        summary_json TEXT NOT NULL DEFAULT '{}',
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL,
        score_contribution INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        line_number INTEGER,
        detector TEXT NOT NULL,
        evidence_snippet TEXT,
        tags_json TEXT NOT NULL,
        ai_triage_json TEXT,
        FOREIGN KEY(scan_id) REFERENCES scans(id)
      );
      CREATE TABLE IF NOT EXISTS ai_reviews (
        scan_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        summary TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL,
        recommended_action TEXT NOT NULL,
        reasoning_summary TEXT NOT NULL,
        suggested_rules_json TEXT NOT NULL,
        raw_response TEXT,
        error TEXT,
        token_usage_json TEXT,
        FOREIGN KEY(scan_id) REFERENCES scans(id)
      );
      CREATE TABLE IF NOT EXISTS ai_explanations (
        cache_key TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        finding_id TEXT,
        language TEXT NOT NULL,
        scope TEXT NOT NULL,
        question TEXT,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(scan_id) REFERENCES scans(id)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.ensureColumnExists("findings", "rule_id", "TEXT");
    this.ensureColumnExists("findings", "confidence", "REAL");
    this.ensureColumnExists("findings", "category", "TEXT");
    this.ensureColumnExists("findings", "summary", "TEXT");
    this.ensureColumnExists("findings", "rationale", "TEXT");
    this.ensureColumnExists("findings", "recommendation", "TEXT");
    this.ensureColumnExists("findings", "false_positive_note", "TEXT");
    this.ensureColumnExists("findings", "evidence_json", "TEXT");
    this.ensureColumnExists("findings", "ai_triage_json", "TEXT");
    this.ensureColumnExists("findings", "related_lines_json", "TEXT");
    this.ensureColumnExists("findings", "match_count", "INTEGER");
    this.ensureColumnExists("ai_reviews", "language", "TEXT");
    this.ensureColumnExists("ai_reviews", "false_positive_notes_json", "TEXT");
    this.ensureColumnExists("ai_reviews", "key_findings_json", "TEXT");
    this.ensureColumnExists("ai_reviews", "token_usage_json", "TEXT");
    const existing = this.db.prepare("SELECT COUNT(*) AS count FROM settings").get() as { count: number };
    if (existing.count === 0) {
      await this.saveSettings(createDefaultSettings(this.env));
    }
  }

  private ensureColumnExists(tableName: string, columnName: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  public async getSettings(): Promise<StoredSettings> {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    if (rows.length === 0) {
      return createDefaultSettings(this.env);
    }

    const data = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value) as RowValue]));
    const defaults = createDefaultSettings(this.env);
    return {
      ...defaults,
      ...(data as Partial<StoredSettings>),
      scannerToggles: {
        ...defaults.scannerToggles,
        ...((data.scannerToggles as Partial<StoredSettings["scannerToggles"]> | undefined) ?? {})
      }
    };
  }

  public async saveSettings(settings: StoredSettings) {
    this.db.exec("BEGIN");
    try {
      const upsert = this.db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      for (const [key, value] of Object.entries(settings)) {
        upsert.run(key, JSON.stringify(value ?? null));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public async createQueuedScan(input: { id: string; repoUrl: string; branch?: string; repoName: string; startedAt: string; sourceMode?: ScanReport["sourceMode"] }) {
    this.db
      .prepare(`
        INSERT INTO scans(id, repo_url, branch, repo_name, status, current_step, started_at, summary_json)
        VALUES (@id, @repoUrl, @branch, @repoName, 'queued', 'Đã xếp hàng', @startedAt, @summaryJson)
      `)
      .run({
        id: input.id,
        repoUrl: input.repoUrl,
        branch: input.branch ?? null,
        repoName: input.repoName,
        startedAt: input.startedAt,
        summaryJson: JSON.stringify({
          sourceMode: input.sourceMode ?? "clone",
          runtime: {
            filesEnumerated: 0,
            directoriesEnumerated: 0,
            textFilesRead: 0,
            detectorTimings: [],
            logs: [
              {
                timestamp: input.startedAt,
                level: "info",
                message: "Đã đưa vào hàng đợi quét."
              }
            ]
          }
        })
      });
  }

  public async updateScanProgress(
    id: string,
    progress: number,
    currentStep: string,
    status: "queued" | "running" | "completed" | "failed" | "cancelled" = "running",
    options?: {
      runtimePatch?: Record<string, unknown>;
      log?: ScanLogEntry;
      errorMessage?: string;
    }
  ) {
    const row = this.db.prepare("SELECT summary_json FROM scans WHERE id = ?").get(id) as { summary_json?: string } | undefined;
    const summaryJson = row?.summary_json ? (JSON.parse(row.summary_json) as Record<string, unknown>) : {};
    const runtime = (summaryJson.runtime as Record<string, unknown> | undefined) ?? {
      filesEnumerated: 0,
      directoriesEnumerated: 0,
      textFilesRead: 0,
      detectorTimings: [],
      logs: []
    };

    const logs = Array.isArray(runtime.logs) ? [...(runtime.logs as ScanLogEntry[])] : [];
    if (options?.log) {
      logs.push(options.log);
    }

    summaryJson.runtime = {
      ...runtime,
      ...options?.runtimePatch,
      logs: logs.slice(-80),
      lastActivityAt: new Date().toISOString()
    };

    this.db
      .prepare("UPDATE scans SET progress = ?, current_step = ?, status = ?, error_message = COALESCE(?, error_message), summary_json = ? WHERE id = ?")
      .run(progress, currentStep, status, options?.errorMessage ?? null, JSON.stringify(summaryJson), id);
  }

  public async saveCompletedScan(report: ScanReport, options?: { preserveAiExplanations?: boolean }) {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          UPDATE scans
          SET repo_name = ?, status = ?, progress = 100, current_step = ?, overall_score = ?, severity_bucket = ?, ai_escalated = ?, findings_count = ?, summary_json = ?, completed_at = ?, error_message = ?
          WHERE id = ?
        `)
        .run(
          report.repoName,
          report.status,
          report.status === "failed" ? "Thất bại" : "Hoàn tất",
          report.risk.totalScore,
          report.risk.severityBucket,
          report.aiEscalated ? 1 : 0,
          report.findings.length,
          JSON.stringify({
            sourceMode: report.sourceMode,
            suspiciousFiles: report.suspiciousFiles,
            dependencies: report.dependencies,
            secrets: report.secrets,
            risk: report.risk,
            metrics: report.metrics,
            runtime: report.runtime,
            tokenUsage: report.tokenUsage,
            raw: report.raw,
            externalScanners: report.externalScanners
          }),
          report.completedAt ?? null,
          report.errorMessage ?? null,
          report.id
        );
      this.db.prepare("DELETE FROM findings WHERE scan_id = ?").run(report.id);
      if (!options?.preserveAiExplanations) {
        this.db.prepare("DELETE FROM ai_explanations WHERE scan_id = ?").run(report.id);
      }
      const insertFinding = this.db.prepare(`
        INSERT INTO findings(id, scan_id, rule_id, title, description, severity, confidence, category, summary, rationale, recommendation, false_positive_note, score_contribution, file_path, line_number, detector, evidence_snippet, evidence_json, tags_json, ai_triage_json, related_lines_json, match_count)
        VALUES (@id, @scanId, @ruleId, @title, @description, @severity, @confidence, @category, @summary, @rationale, @recommendation, @falsePositiveNote, @scoreContribution, @filePath, @lineNumber, @detector, @evidenceSnippet, @evidenceJson, @tagsJson, @aiTriageJson, @relatedLinesJson, @matchCount)
      `);

      for (const finding of report.findings) {
        insertFinding.run({
          id: finding.id,
          scanId: report.id,
          ruleId: finding.ruleId,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          confidence: normalizeConfidenceValue(finding.confidence, 0.5),
          category: normalizeFindingCategory(finding),
          summary: finding.summary,
          rationale: finding.rationale,
          recommendation: finding.recommendation,
          falsePositiveNote: finding.falsePositiveNote ?? null,
          scoreContribution: finding.scoreContribution,
          filePath: finding.filePath,
          lineNumber: finding.lineNumber ?? null,
          detector: finding.detector,
          evidenceSnippet: finding.evidenceSnippet ?? null,
          evidenceJson: JSON.stringify(finding.evidence ?? []),
          tagsJson: JSON.stringify(finding.tags),
          aiTriageJson: finding.aiTriage ? JSON.stringify(finding.aiTriage) : null,
          relatedLinesJson: finding.relatedLineNumbers?.length ? JSON.stringify(finding.relatedLineNumbers) : null,
          matchCount: finding.matchCount ?? null
        });
      }

      this.db.prepare("DELETE FROM ai_reviews WHERE scan_id = ?").run(report.id);
      if (report.aiReview) {
        this.db
          .prepare(`
            INSERT INTO ai_reviews(scan_id, model, language, summary, severity, confidence, recommended_action, reasoning_summary, false_positive_notes_json, key_findings_json, suggested_rules_json, raw_response, error, token_usage_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            report.id,
            report.aiReview.model,
            report.aiReview.language ?? null,
            report.aiReview.summary,
            report.aiReview.severity,
            normalizeConfidenceValue(report.aiReview.confidence, 0.5),
            report.aiReview.recommendedAction,
            report.aiReview.reasoningSummary,
            JSON.stringify(report.aiReview.falsePositiveNotes ?? []),
            JSON.stringify(report.aiReview.keyFindings ?? []),
            JSON.stringify(report.aiReview.suggestedRules),
            report.aiReview.rawResponse ?? null,
            report.aiReview.error ?? null,
            report.aiReview.tokenUsage ? JSON.stringify(report.aiReview.tokenUsage) : null
          );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public async markScanFailed(id: string, errorMessage: string) {
    this.db
      .prepare("UPDATE scans SET status = 'failed', progress = 100, current_step = 'Thất bại', error_message = ?, completed_at = ? WHERE id = ?")
      .run(errorMessage, new Date().toISOString(), id);
  }

  public async markScanCancelled(id: string, message: string) {
    this.db
      .prepare("UPDATE scans SET status = 'cancelled', progress = 100, current_step = 'Đã hủy', error_message = ?, completed_at = ? WHERE id = ?")
      .run(message, new Date().toISOString(), id);
  }

  public async deleteScan(id: string) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM findings WHERE scan_id = ?").run(id);
      this.db.prepare("DELETE FROM ai_reviews WHERE scan_id = ?").run(id);
      this.db.prepare("DELETE FROM ai_explanations WHERE scan_id = ?").run(id);
      const result = this.db.prepare("DELETE FROM scans WHERE id = ?").run(id);
      this.db.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public async deleteAllScans() {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM findings").run();
      this.db.prepare("DELETE FROM ai_reviews").run();
      this.db.prepare("DELETE FROM ai_explanations").run();
      const result = this.db.prepare("DELETE FROM scans").run();
      this.db.exec("COMMIT");
      return result.changes;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public async listScans() {
    const rows = this.db.prepare("SELECT * FROM scans ORDER BY started_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const summaryJson = row.summary_json ? (JSON.parse(String(row.summary_json)) as Record<string, unknown>) : {};
      const tokenUsage = summaryJson.tokenUsage as ScanReport["tokenUsage"] | undefined;
      return {
      id: row.id,
      repoUrl: row.repo_url,
      branch: row.branch,
      repoName: row.repo_name,
      sourceMode: summaryJson.sourceMode as ScanReport["sourceMode"] | undefined,
      status: row.status,
      progress: row.progress,
      currentStep: row.current_step,
      overallScore: row.overall_score,
      severityBucket: row.severity_bucket,
      aiEscalated: Boolean(row.ai_escalated),
      findingsCount: row.findings_count,
      totalTokens: Number(tokenUsage?.total.totalTokens ?? 0),
      tokenBreakdown: {
        aiReview: Number(tokenUsage?.byPhase?.aiReview?.totalTokens ?? 0),
        aiTriage: Number(tokenUsage?.byPhase?.aiTriage?.totalTokens ?? 0),
        reportExplanation: Number(tokenUsage?.byPhase?.reportExplanation?.totalTokens ?? 0),
        findingExplanations: Number(Object.values(tokenUsage?.byPhase?.findingExplanations ?? {}).reduce((sum, usage) => sum + Number(usage?.totalTokens ?? 0), 0)),
        explainedFindings: Number(Object.keys(tokenUsage?.byPhase?.findingExplanations ?? {}).length)
      },
      startedAt: row.started_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message
    };});
  }

  public async getCachedAiExplanation(input: { scanId: string; findingId?: string; language: UiLanguage; scope: "finding" | "report"; question?: string }) {
    const row = this.db.prepare(`
      SELECT response_json FROM ai_explanations
      WHERE cache_key = ?
    `).get(this.buildAiExplanationCacheKey(input)) as { response_json?: string } | undefined;

    if (!row?.response_json) {
      return null;
    }

    const parsed = JSON.parse(String(row.response_json)) as AiExplanation;
    return {
      ...parsed,
      confidence: normalizeConfidenceValue(parsed.confidence, 0.5)
    } as AiExplanation;
  }

  public async saveAiReview(scanId: string, aiReview: ScanReport["aiReview"], aiEscalated: boolean) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM ai_reviews WHERE scan_id = ?").run(scanId);
      if (aiReview) {
        this.db
          .prepare(`
            INSERT INTO ai_reviews(scan_id, model, language, summary, severity, confidence, recommended_action, reasoning_summary, false_positive_notes_json, key_findings_json, suggested_rules_json, raw_response, error, token_usage_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            scanId,
            aiReview.model,
            aiReview.language ?? null,
            aiReview.summary,
            aiReview.severity,
            normalizeConfidenceValue(aiReview.confidence, 0.5),
            aiReview.recommendedAction,
            aiReview.reasoningSummary,
            JSON.stringify(aiReview.falsePositiveNotes ?? []),
            JSON.stringify(aiReview.keyFindings ?? []),
            JSON.stringify(aiReview.suggestedRules),
            aiReview.rawResponse ?? null,
            aiReview.error ?? null,
            aiReview.tokenUsage ? JSON.stringify(aiReview.tokenUsage) : null
          );
      }

      const row = this.db.prepare("SELECT summary_json FROM scans WHERE id = ?").get(scanId) as { summary_json?: string } | undefined;
      const summaryJson = row?.summary_json ? (JSON.parse(String(row.summary_json)) as Record<string, unknown>) : {};
      const tokenUsage = normalizeScanTokenUsage(summaryJson.tokenUsage as ScanTokenUsage | undefined);
      tokenUsage.byPhase = {
        ...tokenUsage.byPhase,
        aiReview: aiReview?.tokenUsage ? normalizeTokenUsage(aiReview.tokenUsage) : undefined
      };
      tokenUsage.total = computeScanTotalTokenUsage(tokenUsage.byPhase);
      summaryJson.tokenUsage = tokenUsage;

      this.db.prepare("UPDATE scans SET ai_escalated = ?, summary_json = ? WHERE id = ?").run(aiEscalated ? 1 : 0, JSON.stringify(summaryJson), scanId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public async saveAiExplanation(input: { scanId: string; findingId?: string; language: UiLanguage; scope: "finding" | "report"; question?: string; response: AiExplanation }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO ai_explanations(cache_key, scan_id, finding_id, language, scope, question, response_json, created_at, updated_at)
      VALUES (@cacheKey, @scanId, @findingId, @language, @scope, @question, @responseJson, @createdAt, @updatedAt)
      ON CONFLICT(cache_key) DO UPDATE SET
        response_json = excluded.response_json,
        updated_at = excluded.updated_at
    `).run({
      cacheKey: this.buildAiExplanationCacheKey(input),
      scanId: input.scanId,
      findingId: input.findingId ?? null,
      language: input.language,
      scope: input.scope,
      question: input.question?.trim() || null,
      responseJson: JSON.stringify(input.response),
      createdAt: now,
      updatedAt: now
    });

    this.updateScanTokenUsageForExplanation(input.scanId, input.scope, input.findingId, input.response.tokenUsage);
  }

  private updateScanTokenUsageForExplanation(scanId: string, scope: "finding" | "report", findingId: string | undefined, nextUsage: TokenUsage | undefined) {
    const row = this.db.prepare("SELECT summary_json FROM scans WHERE id = ?").get(scanId) as { summary_json?: string } | undefined;
    const summaryJson = row?.summary_json ? (JSON.parse(String(row.summary_json)) as Record<string, unknown>) : {};
    const tokenUsage = normalizeScanTokenUsage(summaryJson.tokenUsage as ScanTokenUsage | undefined);

    if (scope === "report") {
      tokenUsage.byPhase = {
        ...tokenUsage.byPhase,
        reportExplanation: nextUsage ? normalizeTokenUsage(nextUsage) : undefined
      };
    } else if (findingId) {
      const findingExplanations = {
        ...(tokenUsage.byPhase?.findingExplanations ?? {})
      };
      if (nextUsage) {
        findingExplanations[findingId] = normalizeTokenUsage(nextUsage);
      } else {
        delete findingExplanations[findingId];
      }
      tokenUsage.byPhase = {
        ...tokenUsage.byPhase,
        findingExplanations
      };
    }

    tokenUsage.total = computeScanTotalTokenUsage(tokenUsage.byPhase);
    summaryJson.tokenUsage = tokenUsage;
    this.db.prepare("UPDATE scans SET summary_json = ? WHERE id = ?").run(JSON.stringify(summaryJson), scanId);
  }

  private buildAiExplanationCacheKey(input: { scanId: string; findingId?: string; language: UiLanguage; scope: "finding" | "report"; question?: string }) {
    return [
      input.scanId,
      input.scope,
      input.findingId ?? "report",
      input.language,
      (input.question ?? "").trim()
    ].join("::");
  }

  public async getScanById(id: string): Promise<ScanReport | null> {
    const row = this.db.prepare("SELECT * FROM scans WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const findings = (this.db.prepare("SELECT * FROM findings WHERE scan_id = ? ORDER BY score_contribution DESC").all(id) as Array<Record<string, unknown>>).map((finding) => ({
      id: String(finding.id),
      ruleId: finding.rule_id ? String(finding.rule_id) : `${String(finding.detector)}.legacy`,
      title: String(finding.title),
      description: String(finding.description),
      summary: finding.summary ? String(finding.summary) : String(finding.description),
      rationale: finding.rationale ? String(finding.rationale) : String(finding.description),
      recommendation: finding.recommendation ? String(finding.recommendation) : "Review this finding manually.",
      falsePositiveNote: finding.false_positive_note ? String(finding.false_positive_note) : undefined,
      severity: finding.severity as Severity,
      confidence: normalizeConfidenceValue(finding.confidence, 0.5),
      category: normalizeFindingCategory({
        ruleId: String(finding.rule_id),
        title: String(finding.title),
        category: finding.category ? String(finding.category) : "",
        detector: String(finding.detector),
        filePath: String(finding.file_path)
      }),
      scoreContribution: Number(finding.score_contribution),
      filePath: String(finding.file_path),
      lineNumber: finding.line_number ? Number(finding.line_number) : undefined,
      relatedLineNumbers: finding.related_lines_json ? JSON.parse(String(finding.related_lines_json)) as number[] : undefined,
      matchCount: finding.match_count ? Number(finding.match_count) : undefined,
      detector: String(finding.detector),
      evidenceSnippet: finding.evidence_snippet ? String(finding.evidence_snippet) : undefined,
      evidence: finding.evidence_json ? JSON.parse(String(finding.evidence_json)) : [],
      tags: JSON.parse(String(finding.tags_json)) as string[],
      aiTriage: finding.ai_triage_json ? JSON.parse(String(finding.ai_triage_json)) : undefined
    }));
    const aiRow = this.db.prepare("SELECT * FROM ai_reviews WHERE scan_id = ?").get(id) as Record<string, unknown> | undefined;
    const summaryJson = JSON.parse(String(row.summary_json)) as Record<string, unknown>;
    const settings = await this.getSettings();
    const fallbackRisk = {
      totalScore: Number(row.overall_score ?? 0),
      severityBucket: (row.severity_bucket as Severity | undefined) ?? "low",
      needsAiReview: false,
      threshold: settings.suspicionThreshold,
      severitySummary: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      }
    };

    return {
      id: String(row.id),
      repoUrl: String(row.repo_url),
      branch: row.branch ? String(row.branch) : undefined,
      sourceMode: (summaryJson.sourceMode as ScanReport["sourceMode"] | undefined) ?? (summaryJson.raw as Record<string, unknown> | undefined)?.sourceMode as ScanReport["sourceMode"] | undefined,
      status: row.status as ScanReport["status"],
      progress: Number(row.progress ?? 0),
      currentStep: row.current_step ? String(row.current_step) : undefined,
      startedAt: String(row.started_at),
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      repoName: String(row.repo_name),
      findings,
      suspiciousFiles: (summaryJson.suspiciousFiles as string[] | undefined) ?? [],
      dependencies: (summaryJson.dependencies as ScanReport["dependencies"] | undefined) ?? [],
      secrets: (summaryJson.secrets as ScanReport["secrets"] | undefined) ?? [],
      externalScanners: (summaryJson.externalScanners as ScanReport["externalScanners"] | undefined) ?? [],
      aiReview: aiRow
        ? {
            model: String(aiRow.model),
            summary: String(aiRow.summary),
            severity: aiRow.severity as Severity,
            language: aiRow.language ? String(aiRow.language) as UiLanguage : undefined,
            confidence: normalizeConfidenceValue(aiRow.confidence, 0.5),
            recommendedAction: String(aiRow.recommended_action),
            reasoningSummary: String(aiRow.reasoning_summary),
            falsePositiveNotes: aiRow.false_positive_notes_json ? JSON.parse(String(aiRow.false_positive_notes_json)) as string[] : [],
            keyFindings: aiRow.key_findings_json ? JSON.parse(String(aiRow.key_findings_json)) : [],
            suggestedRules: JSON.parse(String(aiRow.suggested_rules_json)) as string[],
            rawResponse: aiRow.raw_response ? normalizeStoredAiRawResponse(String(aiRow.raw_response), normalizeConfidenceValue(aiRow.confidence, 0.5)) : undefined,
            error: aiRow.error ? String(aiRow.error) : undefined,
            tokenUsage: aiRow.token_usage_json ? normalizeTokenUsage(JSON.parse(String(aiRow.token_usage_json)) as TokenUsage) : undefined
          }
        : undefined,
      aiEscalated: Boolean(row.ai_escalated),
      risk: (summaryJson.risk as ScanReport["risk"] | undefined) ?? fallbackRisk,
      metrics: summaryJson.metrics as ScanReport["metrics"] | undefined,
      runtime: summaryJson.runtime as ScanReport["runtime"] | undefined,
      tokenUsage: summaryJson.tokenUsage as ScanReport["tokenUsage"] | undefined,
      raw: (summaryJson.raw as Record<string, unknown>) ?? {
        progress: Number(row.progress ?? 0),
        currentStep: row.current_step ? String(row.current_step) : undefined
      },
      errorMessage: row.error_message ? String(row.error_message) : undefined
    };
  }
}


function normalizeStoredAiRawResponse(raw: string, fallbackConfidence: number) {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized = { ...parsed };
    normalized.confidence = normalizeConfidenceValue(parsed.confidence, fallbackConfidence);
    if (Array.isArray(parsed.keyFindings)) {
      normalized.keyFindings = parsed.keyFindings.map((item) => ({
        ...(item as Record<string, unknown>),
        confidence: normalizeConfidenceValue((item as Record<string, unknown>).confidence, fallbackConfidence)
      }));
    }
    return JSON.stringify(normalized);
  } catch {
    return raw;
  }
}

function normalizeTokenUsage(value: TokenUsage | undefined): TokenUsage {
  return {
    inputTokens: Number(value?.inputTokens ?? 0),
    outputTokens: Number(value?.outputTokens ?? 0),
    totalTokens: Number(value?.totalTokens ?? ((value?.inputTokens ?? 0) + (value?.outputTokens ?? 0)))
  };
}

function normalizeScanTokenUsage(value: ScanTokenUsage | undefined): ScanTokenUsage {
  return {
    total: normalizeTokenUsage(value?.total),
    byPhase: {
      aiReview: value?.byPhase?.aiReview ? normalizeTokenUsage(value.byPhase.aiReview) : undefined,
      aiTriage: value?.byPhase?.aiTriage ? normalizeTokenUsage(value.byPhase.aiTriage) : undefined,
      reportExplanation: value?.byPhase?.reportExplanation ? normalizeTokenUsage(value.byPhase.reportExplanation) : undefined,
      findingExplanations: Object.fromEntries(Object.entries(value?.byPhase?.findingExplanations ?? {}).map(([key, usage]) => [key, normalizeTokenUsage(usage)]))
    }
  };
}

function computeScanTotalTokenUsage(byPhase: ScanTokenUsage["byPhase"] | undefined): TokenUsage {
  const total = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const usages = [byPhase?.aiReview, byPhase?.aiTriage, byPhase?.reportExplanation, ...Object.values(byPhase?.findingExplanations ?? {})].filter(Boolean) as TokenUsage[];
  for (const usage of usages) {
    total.inputTokens += Number(usage.inputTokens ?? 0);
    total.outputTokens += Number(usage.outputTokens ?? 0);
    total.totalTokens += Number(usage.totalTokens ?? 0);
  }
  return total;
}

