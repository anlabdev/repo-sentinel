import fs from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express from "express";
import { z } from "zod";
import type { DashboardResponse, HealthResponse, SaveSettingsRequest, ScanRequest, SettingsResponse, UiLanguage } from "../../shared/src/index.js";
import { env } from "./config/env.js";
import { Database, type StoredSettings } from "./db/database.js";
import { AVAILABLE_OPENAI_MODELS, OpenAiReviewService } from "./services/ai/openAiReviewService.js";
import { GitService } from "./services/git/gitService.js";
import { buildReportHtml } from "./services/report/htmlReport.js";
import { buildReportPdf } from "./services/report/pdfReport.js";
import { ExternalScannerRegistry } from "./services/scanners/externalScannerAdapters.js";
import { ScanEngine } from "./services/scanners/scanEngine.js";
import { buildOpenAiBudgetState, ensureAiBudgetAvailable } from "./utils/ai-budget.js";

const scanRequestSchema = z.object({ repoUrl: z.string().url(), branch: z.string().min(1).max(200).optional(), allowAi: z.boolean().optional(), confirmBudgetOverride: z.boolean().optional(), fetchMode: z.enum(["clone", "snapshot", "remote"]).optional(), language: z.enum(["vi", "en"]).optional() });
const uploadScanQuerySchema = z.object({ repoName: z.string().min(1).max(200).optional(), allowAi: z.enum(["true", "false"]).optional(), confirmBudgetOverride: z.enum(["true", "false"]).optional(), language: z.enum(["vi", "en"]).optional() });
const explainSchema = z.object({ findingId: z.string().min(1).optional(), language: z.enum(["vi", "en"]).default("vi"), question: z.string().max(2000).optional(), force: z.boolean().optional(), confirmBudgetOverride: z.boolean().optional() });
const settingsSchema = z.object({ suspicionThreshold: z.number().int().min(1).max(100), enableOpenAi: z.boolean(), openAiModel: z.string().min(1).max(100), parallelScans: z.number().int().min(1).max(8), scanRetentionLimit: z.number().int().min(20).max(5000), aiTokenLimit: z.number().int().min(0).max(100000000), aiTokenWarningPercent: z.number().int().min(1).max(100), findingAllowlist: z.array(z.string().max(300)).max(200), openAiApiKey: z.string().max(500).optional(), scannerToggles: z.object({ builtIn: z.boolean(), semgrep: z.boolean(), trivy: z.boolean(), osvScanner: z.boolean(), yara: z.boolean() }) });
const validateOpenAiSchema = z.object({ openAiApiKey: z.string().max(500).optional(), openAiModel: z.string().min(1).max(100).optional(), language: z.enum(["vi", "en"]).optional() });
const retryAiSchema = z.object({ question: z.string().max(2000).optional(), language: z.enum(["vi", "en"]).optional(), confirmBudgetOverride: z.boolean().optional() });

type ScanListRow = { id: string; repoUrl: string; branch?: string; repoName: string; status: "queued" | "running" | "completed" | "failed" | "cancelled"; overallScore: number; severityBucket: "low" | "medium" | "high" | "critical"; aiEscalated: boolean; findingsCount: number; totalTokens?: number; startedAt: string; completedAt?: string };

async function ensureValidatedSettings(db: Database, aiService: OpenAiReviewService, settings: StoredSettings) {
  if (!settings.openAiApiKey) {
    if (settings.openAiValidationStatus !== "missing" || settings.enableOpenAi) {
      const next: StoredSettings = {
        ...settings,
        enableOpenAi: false,
        openAiValidationStatus: "missing",
        openAiValidationMessage: "OpenAI API key is missing.",
        openAiLastValidatedAt: settings.openAiLastValidatedAt
      };
      await db.saveSettings(next);
      return next;
    }
    return settings;
  }

  if (settings.openAiValidationStatus === "unchecked") {
    const validation = await aiService.validateConfiguration({ apiKey: settings.openAiApiKey, model: settings.openAiModel, language: "vi" });
    const next: StoredSettings = {
      ...settings,
      enableOpenAi: validation.validationStatus === "valid" ? settings.enableOpenAi : false,
      openAiValidationStatus: validation.validationStatus,
      openAiValidationMessage: validation.validationMessage,
      openAiLastValidatedAt: validation.lastValidatedAt
    };
    await db.saveSettings(next);
    return next;
  }

  return settings;
}

async function getTotalTokensUsed(db: Database) {
  const scans = await db.listScans() as ScanListRow[];
  return scans.reduce((sum, scan) => sum + Number(scan.totalTokens ?? 0), 0);
}

function toSettingsResponse(settings: StoredSettings, env: typeof import("./config/env.js").env, toolAvailability: Awaited<ReturnType<ExternalScannerRegistry["getAvailability"]>>, totalTokensUsed: number): SettingsResponse {
  return {
    suspicionThreshold: settings.suspicionThreshold,
    enableOpenAi: settings.enableOpenAi,
    openAiModel: settings.openAiModel,
    parallelScans: settings.parallelScans,
    scanRetentionLimit: settings.scanRetentionLimit,
    scannerToggles: settings.scannerToggles,
    aiTokenLimit: settings.aiTokenLimit,
    aiTokenWarningPercent: settings.aiTokenWarningPercent,
    findingAllowlist: settings.findingAllowlist,
    toolAvailability,
    openAi: {
      configured: Boolean(settings.openAiApiKey),
      model: settings.openAiModel,
      validationStatus: settings.openAiValidationStatus,
      validationMessage: settings.openAiValidationMessage,
      lastValidatedAt: settings.openAiLastValidatedAt,
      apiKeyPreview: settings.openAiApiKey ? `••••••••${settings.openAiApiKey.slice(-4)}` : undefined,
      apiKeyInput: undefined,
      availableModels: [...AVAILABLE_OPENAI_MODELS],
      budget: buildOpenAiBudgetState(settings, totalTokensUsed)
    },
    env: {
      openAiConfigured: Boolean(settings.openAiApiKey),
      dbPath: env.dbPath,
      tempDir: env.tempDir
    }
  };
}

export async function createApp() {
  const db = new Database(env); await db.initialize();
  const externalRegistry = new ExternalScannerRegistry();
  const gitService = new GitService(env.tempDir, env.githubToken);
  const aiService = new OpenAiReviewService(env);
  const scanEngine = new ScanEngine({ db, env, externalRegistry, gitService, aiService });
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString(), version: "0.1.0" } satisfies HealthResponse));

  app.get("/api/dashboard", async (_req, res) => {
    const scans = await db.listScans() as ScanListRow[];
    const latestScan = scans[0];
    const latestReport = latestScan ? await db.getScanById(latestScan.id) : null;
    const severityDistribution = scans.reduce((summary, scan) => { summary[scan.severityBucket] += 1; return summary; }, { low: 0, medium: 0, high: 0, critical: 0 });
    const detectorCoverage = latestReport ? [...latestReport.findings.reduce((map, finding) => { map.set(finding.detector, (map.get(finding.detector) ?? 0) + 1); return map; }, new Map<string, number>()).entries()].map(([detector, findingsCount]) => ({ detector, findingsCount })).sort((a, b) => b.findingsCount - a.findingsCount) : [];
    const response: DashboardResponse = {
      totals: {
        totalScans: scans.length,
        completedScans: scans.filter((scan) => scan.status === "completed").length,
        runningScans: scans.filter((scan) => scan.status === "queued" || scan.status === "running").length,
        escalatedScans: scans.filter((scan) => scan.aiEscalated).length,
        highRiskScans: scans.filter((scan) => scan.severityBucket === "high" || scan.severityBucket === "critical").length,
        totalTokensUsed: scans.reduce((sum, scan) => sum + Number(scan.totalTokens ?? 0), 0)
      },
      latestScan: latestScan ? { id: latestScan.id, repoName: latestScan.repoName, repoUrl: latestScan.repoUrl, branch: latestScan.branch, status: latestScan.status, severityBucket: latestScan.severityBucket, overallScore: latestScan.overallScore, findingsCount: latestScan.findingsCount, startedAt: latestScan.startedAt, completedAt: latestScan.completedAt } : undefined,
      severityDistribution,
      detectorCoverage,
      recentActivity: scans.slice(0, 8).map((scan) => ({ id: scan.id, repoName: scan.repoName, status: scan.status, severityBucket: scan.severityBucket, findingsCount: scan.findingsCount, startedAt: scan.startedAt }))
    };
    res.json(response);
  });

  app.get("/api/settings", async (_req, res) => {
    const settings = await ensureValidatedSettings(db, aiService, await db.getSettings());
    return res.json(toSettingsResponse(settings, env, await externalRegistry.getAvailability(), await getTotalTokensUsed(db)));
  });

  app.post("/api/settings/validate-openai", async (req, res) => {
    const parsed = validateOpenAiSchema.safeParse(req.body ?? {}); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const current = await db.getSettings();
    const provided = typeof parsed.data.openAiApiKey === "string" ? parsed.data.openAiApiKey.trim() : undefined;
    const validation = await aiService.validateConfiguration({
      apiKey: provided !== undefined ? provided : current.openAiApiKey,
      model: parsed.data.openAiModel ?? current.openAiModel,
      language: parsed.data.language ?? "vi"
    });
    return res.json(validation);
  });

  app.put("/api/settings", async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const current = await db.getSettings();
    const body: SaveSettingsRequest = parsed.data;
    const hasApiKeyField = typeof req.body?.openAiApiKey === "string";
    const requestedApiKey = hasApiKeyField ? body.openAiApiKey?.trim() : current.openAiApiKey;
    const validation = await aiService.validateConfiguration({ apiKey: requestedApiKey, model: body.openAiModel, language: "vi" });

    if (hasApiKeyField && requestedApiKey && validation.validationStatus !== "valid") {
      return res.status(400).json({ error: validation.validationMessage ?? "OpenAI API key không hợp lệ.", openAi: validation });
    }

    const nextSettings: StoredSettings = {
      ...current,
      suspicionThreshold: body.suspicionThreshold,
      enableOpenAi: body.enableOpenAi && validation.validationStatus === "valid",
      openAiModel: body.openAiModel,
      parallelScans: body.parallelScans,
      aiTokenLimit: body.aiTokenLimit,
      aiTokenWarningPercent: body.aiTokenWarningPercent,
      findingAllowlist: body.findingAllowlist,
      openAiApiKey: requestedApiKey || undefined,
      openAiValidationStatus: validation.validationStatus,
      openAiValidationMessage: validation.validationMessage,
      openAiLastValidatedAt: validation.lastValidatedAt,
      scannerToggles: body.scannerToggles
    };
    await db.saveSettings(nextSettings);
    return res.json(toSettingsResponse(nextSettings, env, await externalRegistry.getAvailability(), await getTotalTokensUsed(db)));
  });

  app.post("/api/scans", async (req, res) => {
    const parsed = scanRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const payload: ScanRequest = parsed.data;
    const settings = await ensureValidatedSettings(db, aiService, await db.getSettings());
    if (payload.allowAi && settings.enableOpenAi && settings.openAiApiKey && settings.openAiValidationStatus === "valid") {
      const budget = buildOpenAiBudgetState(settings, await getTotalTokensUsed(db));
      try {
        ensureAiBudgetAvailable(budget, payload.confirmBudgetOverride);
      } catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : "AI token budget confirmation required.", budget, requiresConfirmation: true });
      }
    }
    return res.status(202).json(await scanEngine.enqueueScan(payload));
  });

  app.post("/api/scans/upload", express.raw({ type: () => true, limit: "500mb" }), async (req, res) => {
    const parsed = uploadScanQuerySchema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.includes("zip") && contentType !== "application/octet-stream") {
      return res.status(400).json({ error: "Chỉ hỗ trợ file .zip." });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Không nhận được dữ liệu file zip." });
    }

    const originalName = decodeURIComponent(String(req.headers["x-file-name"] ?? parsed.data.repoName ?? "uploaded-project.zip"));
    const repoName = (parsed.data.repoName ?? originalName.replace(/\.zip$/i, "")).trim();
    const uploadDir = path.join(env.tempDir, "incoming");
    await fs.mkdir(uploadDir, { recursive: true });
    const tempFilePath = path.join(uploadDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await fs.writeFile(tempFilePath, req.body);

    const payload: ScanRequest = {
      repoUrl: `upload://${repoName || "uploaded-project"}`,
      allowAi: parsed.data.allowAi !== "false",
      confirmBudgetOverride: parsed.data.confirmBudgetOverride === "true",
      fetchMode: "upload",
      language: parsed.data.language ?? "vi",
      uploadedArchive: {
        tempFilePath,
        originalName,
        repoName: repoName || originalName.replace(/\.zip$/i, "")
      }
    };

    const settings = await ensureValidatedSettings(db, aiService, await db.getSettings());
    if (payload.allowAi && settings.enableOpenAi && settings.openAiApiKey && settings.openAiValidationStatus === "valid") {
      const budget = buildOpenAiBudgetState(settings, await getTotalTokensUsed(db));
      try {
        ensureAiBudgetAvailable(budget, payload.confirmBudgetOverride);
      } catch (error) {
        await fs.rm(tempFilePath, { force: true });
        return res.status(409).json({ error: error instanceof Error ? error.message : "AI token budget confirmation required.", budget, requiresConfirmation: true });
      }
    }

    return res.status(202).json(await scanEngine.enqueueScan(payload));
  });

  app.post("/api/scans/:id/explain", async (req, res) => {
    const parsed = explainSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const scan = await db.getScanById(req.params.id); if (!scan) return res.status(404).json({ error: "Không tìm thấy báo cáo quét." });
    if (parsed.data.findingId) {
      const finding = scan.findings.find((item) => item.id === parsed.data.findingId); if (!finding) return res.status(404).json({ error: "Không tìm thấy finding cần giải thích." });
      const cacheInput = { scanId: scan.id, findingId: finding.id, language: parsed.data.language, scope: "finding" as const, question: parsed.data.question };
      if (!parsed.data.force) {
        const cached = await db.getCachedAiExplanation(cacheInput);
        if (cached) return res.json({ ...cached, cacheSource: "db" });
      }
      const currentSettings = await ensureValidatedSettings(db, aiService, await db.getSettings());
      if (!currentSettings.openAiApiKey || currentSettings.openAiValidationStatus !== "valid") return res.status(400).json({ error: "OpenAI API key chưa hợp lệ hoặc chưa được cấu hình." });
      const budget = buildOpenAiBudgetState(currentSettings, await getTotalTokensUsed(db));
      try {
        ensureAiBudgetAvailable(budget, parsed.data.confirmBudgetOverride);
      } catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : "AI token budget confirmation required.", budget, requiresConfirmation: true });
      }
      const explanation = await aiService.explainFinding({ repoUrl: scan.repoUrl, finding, language: parsed.data.language, question: parsed.data.question }, { apiKey: currentSettings.openAiApiKey, model: currentSettings.openAiModel });
      await db.saveAiExplanation({ ...cacheInput, response: explanation });
      return res.json(explanation);
    }
    const cacheInput = { scanId: scan.id, language: parsed.data.language, scope: "report" as const, question: parsed.data.question };
    if (!parsed.data.force) {
      const cached = await db.getCachedAiExplanation(cacheInput);
      if (cached) return res.json({ ...cached, cacheSource: "db" });
    }
    const currentSettings = await ensureValidatedSettings(db, aiService, await db.getSettings());
    if (!currentSettings.openAiApiKey || currentSettings.openAiValidationStatus !== "valid") return res.status(400).json({ error: "OpenAI API key chưa hợp lệ hoặc chưa được cấu hình." });
    const budget = buildOpenAiBudgetState(currentSettings, await getTotalTokensUsed(db));
    try {
      ensureAiBudgetAvailable(budget, parsed.data.confirmBudgetOverride);
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : "AI token budget confirmation required.", budget, requiresConfirmation: true });
    }
    const explanation = await aiService.explainReport({ repoUrl: scan.repoUrl, findings: scan.findings, aiReview: scan.aiReview, language: parsed.data.language, question: parsed.data.question }, { apiKey: currentSettings.openAiApiKey, model: currentSettings.openAiModel });
    await db.saveAiExplanation({ ...cacheInput, response: explanation });
    return res.json(explanation);
  });

  app.post("/api/scans/:id/retry-ai", async (req, res) => {
    const parsed = retryAiSchema.safeParse(req.body ?? {}); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const settings = await ensureValidatedSettings(db, aiService, await db.getSettings());
    if (!settings.openAiApiKey || settings.openAiValidationStatus !== "valid") return res.status(400).json({ error: "OpenAI API key chưa hợp lệ hoặc chưa được cấu hình." });
    const budget = buildOpenAiBudgetState(settings, await getTotalTokensUsed(db));
    try {
      ensureAiBudgetAvailable(budget, parsed.data.confirmBudgetOverride);
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : "AI token budget confirmation required.", budget, requiresConfirmation: true });
    }
    const scan = await db.getScanById(req.params.id); if (!scan) return res.status(404).json({ error: "Không tìm thấy báo cáo quét." });
    if (scan.status !== "completed") return res.status(409).json({ error: "Chỉ có thể thử lại AI review với báo cáo đã hoàn tất." });
    const aiReview = await aiService.review({ repoUrl: scan.repoUrl, findings: scan.findings, files: [], language: parsed.data.language ?? "vi" }, { apiKey: settings.openAiApiKey, model: settings.openAiModel });
    await db.saveAiReview(scan.id, aiReview, Boolean(aiReview));
    return res.json(await db.getScanById(scan.id));
  });

  app.post("/api/scans/:id/cancel", async (req, res) => {
    const cancelled = await scanEngine.cancelScan(req.params.id); if (!cancelled) return res.status(409).json({ error: "Bản quét này không còn đang chạy." });
    return res.json({ ok: true });
  });

  app.delete("/api/scans/:id", async (req, res) => {
    const deleted = await db.deleteScan(req.params.id); if (!deleted) return res.status(404).json({ error: "Không tìm thấy báo cáo quét." });
    return res.json({ ok: true });
  });

  app.delete("/api/scans", async (_req, res) => res.json({ ok: true, deleted: await db.deleteAllScans() }));
  app.get("/api/scans", async (_req, res) => res.json(await db.listScans()));
  app.get("/api/scans/:id", async (req, res) => { const scan = await db.getScanById(req.params.id); if (!scan) return res.status(404).json({ error: "Không tìm thấy báo cáo quét." }); return res.json(scan); });

  app.get("/api/scans/:id/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.flushHeaders?.();
    let unsubscribe = () => {};
    const sendSnapshot = async (scan?: Awaited<ReturnType<typeof db.getScanById>> | null) => {
      if (scan === undefined) scan = await db.getScanById(req.params.id);
      if (!scan) { res.write(`event: error\ndata: ${JSON.stringify({ error: "Không tìm thấy báo cáo quét." })}\n\n`); return; }
      res.write(`event: scan\ndata: ${JSON.stringify(scan)}\n\n`);
      if (["completed", "failed", "cancelled"].includes(scan.status)) { unsubscribe(); res.end(); }
    };
    await sendSnapshot();
    unsubscribe = scanEngine.onScanUpdate((scanId: string, scan) => { if (scanId === req.params.id) void sendSnapshot(scan); });
    req.on("close", () => { unsubscribe(); res.end(); });
  });

  app.get("/api/scans/:id/export/:format", async (req, res) => {
    const scan = await db.getScanById(req.params.id); if (!scan) return res.status(404).json({ error: "Không tìm thấy báo cáo quét." });
    const language = getRequestLanguage(req.query.lang); const safeName = `${scan.repoName}-${scan.id}`;
    if (req.params.format === "json") { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${safeName}.json"`); return res.send(JSON.stringify(scan, null, 2)); }
    if (req.params.format === "html") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${safeName}.html"`); return res.send(buildReportHtml(scan, language)); }
    if (req.params.format === "pdf") { res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`); return res.send(Buffer.from(await buildReportPdf(scan, env, language))); }
    return res.status(400).json({ error: "Định dạng xuất báo cáo không được hỗ trợ." });
  });

  return app;
}

function getRequestLanguage(value: unknown): UiLanguage { return value === "en" ? "en" : "vi"; }

