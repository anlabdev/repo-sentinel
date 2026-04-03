"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { OverviewPanel } from "@/components/dashboard/overview-panel"
import { ScanForm, type ScanConfig } from "@/components/dashboard/scan-form"
import { LiveScanPanel, type ScanProgress, type Finding, type SuspiciousFile } from "@/components/dashboard/live-scan-panel"
import { HistoryPanel, type ScanHistoryItem } from "@/components/dashboard/history-panel"
import { SettingsPanel, type SettingsConfig } from "@/components/dashboard/settings-panel"
import { ScrollArea } from "@/components/ui/scroll-area"

// Mock data generators
function generateMockFindings(): Finding[] {
  const types = ["Obfuscated code", "Suspicious eval()", "Hardcoded credential", "Base64 payload", "Minified malware", "Backdoor signature"]
  const severities: Finding["severity"][] = ["critical", "high", "medium", "low"]
  const files = ["src/utils/helper.js", "lib/crypto.ts", "config/auth.json", "scripts/deploy.sh", "package.json"]
  
  return Array.from({ length: Math.floor(Math.random() * 8) + 1 }, (_, i) => ({
    id: `finding-${i}`,
    severity: severities[Math.floor(Math.random() * severities.length)],
    type: types[Math.floor(Math.random() * types.length)],
    file: files[Math.floor(Math.random() * files.length)],
    line: Math.floor(Math.random() * 500) + 1,
    message: `Detected potentially malicious pattern in ${files[Math.floor(Math.random() * files.length)]}`,
  }))
}

function generateMockSuspiciousFiles(): SuspiciousFile[] {
  const paths = ["node_modules/.bin/hidden", "dist/chunk-abc123.js", ".github/workflows/deploy.yml", "src/api/internal.ts"]
  const reasons = ["Entropy anomaly detected", "Known malware signature", "Suspicious network calls", "Obfuscation detected"]
  
  return Array.from({ length: Math.floor(Math.random() * 4) + 1 }, (_, i) => ({
    path: paths[i % paths.length],
    risk: Math.floor(Math.random() * 40) + 60,
    reason: reasons[i % reasons.length],
  }))
}

const mockHistory: ScanHistoryItem[] = [
  { id: "1", repoName: "acme/frontend", repoPath: "~/repos/acme-frontend", status: "clean", findings: 0, duration: 45, completedAt: new Date(Date.now() - 1800000), scanType: "full" },
  { id: "2", repoName: "acme/api-gateway", repoPath: "~/repos/api-gateway", status: "issues", findings: 3, duration: 78, completedAt: new Date(Date.now() - 3600000), scanType: "full" },
  { id: "3", repoName: "internal/auth-service", repoPath: "~/repos/auth-service", status: "critical", findings: 12, duration: 120, completedAt: new Date(Date.now() - 7200000), scanType: "deep" },
  { id: "4", repoName: "oss/react-utils", repoPath: "github.com/oss/react-utils", status: "clean", findings: 0, duration: 23, completedAt: new Date(Date.now() - 14400000), scanType: "quick" },
  { id: "5", repoName: "vendor/payment-sdk", repoPath: "~/repos/payment-sdk", status: "issues", findings: 5, duration: 92, completedAt: new Date(Date.now() - 28800000), scanType: "full" },
  { id: "6", repoName: "acme/mobile-app", repoPath: "~/repos/mobile-app", status: "error", findings: 0, duration: 12, completedAt: new Date(Date.now() - 43200000), scanType: "quick" },
  { id: "7", repoName: "internal/data-pipeline", repoPath: "~/repos/data-pipeline", status: "clean", findings: 0, duration: 156, completedAt: new Date(Date.now() - 86400000), scanType: "deep" },
]

const defaultSettings: SettingsConfig = {
  riskThreshold: 65,
  autoEscalateThreshold: 85,
  openaiApiKey: "sk-••••••••••••••••••••••••••••••••",
  openaiModel: "gpt-4-turbo",
  enableYara: true,
  enableSemgrep: true,
  enableGitleaks: true,
  enableTruffleHog: false,
  autoScanOnPush: true,
  parallelScans: 4,
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [activeScan, setActiveScan] = useState<ScanProgress | null>(null)
  const [history, setHistory] = useState<ScanHistoryItem[]>(mockHistory)
  const [settings, setSettings] = useState<SettingsConfig>(defaultSettings)
  const [stats, setStats] = useState({
    riskScore: 34,
    activeScans: 0,
    highRiskRepos: 2,
    aiEscalations: 3,
    totalScanned: 47,
    threatsBlocked: 156,
  })

  // Simulate scan progress
  useEffect(() => {
    if (!activeScan || activeScan.status === "complete" || activeScan.status === "error") return

    const interval = setInterval(() => {
      setActiveScan((prev) => {
        if (!prev) return null
        
        const newProgress = Math.min(prev.progress + Math.floor(Math.random() * 8) + 2, 100)
        const newFilesScanned = Math.min(prev.filesScanned + Math.floor(Math.random() * 20) + 5, prev.totalFiles)
        
        if (newProgress >= 100) {
          // Complete the scan
          const newHistory: ScanHistoryItem = {
            id: Date.now().toString(),
            repoName: prev.repoName,
            repoPath: prev.repoName,
            status: prev.findings.length > 5 ? "critical" : prev.findings.length > 0 ? "issues" : "clean",
            findings: prev.findings.length,
            duration: Math.floor((Date.now() - prev.startedAt.getTime()) / 1000),
            completedAt: new Date(),
            scanType: "full",
          }
          setHistory((h) => [newHistory, ...h])
          setStats((s) => ({ ...s, activeScans: Math.max(0, s.activeScans - 1), totalScanned: s.totalScanned + 1 }))
          
          return {
            ...prev,
            progress: 100,
            status: "complete",
            filesScanned: prev.totalFiles,
            aiReview: prev.aiReview ? {
              ...prev.aiReview,
              status: "complete",
              summary: "Analysis complete. Found potential supply chain vulnerability in dependencies. Recommend updating affected packages.",
              recommendations: [
                "Update lodash to latest version",
                "Review authentication flow in auth-service",
                "Consider enabling stricter CSP headers",
              ],
            } : null,
          }
        }

        // Add findings randomly
        const newFindings = newProgress > 30 && Math.random() > 0.7 
          ? [...prev.findings, ...generateMockFindings().slice(0, 1)]
          : prev.findings

        // Add suspicious files randomly
        const newSuspiciousFiles = newProgress > 50 && Math.random() > 0.8
          ? [...prev.suspiciousFiles, ...generateMockSuspiciousFiles().slice(0, 1)]
          : prev.suspiciousFiles

        return {
          ...prev,
          progress: newProgress,
          filesScanned: newFilesScanned,
          status: newProgress > 90 ? "analyzing" : "running",
          findings: newFindings,
          suspiciousFiles: newSuspiciousFiles,
          aiReview: prev.aiReview && newProgress > 90 ? { ...prev.aiReview, status: "processing" } : prev.aiReview,
        }
      })
    }, 500)

    return () => clearInterval(interval)
  }, [activeScan?.status])

  const handleStartScan = useCallback((config: ScanConfig) => {
    const repoName = config.repoPath.split("/").slice(-1)[0] || config.repoPath
    const newScan: ScanProgress = {
      id: Date.now().toString(),
      repoName,
      progress: 0,
      status: "running",
      filesScanned: 0,
      totalFiles: Math.floor(Math.random() * 2000) + 500,
      startedAt: new Date(),
      findings: [],
      suspiciousFiles: [],
      aiReview: config.aiAnalysis ? { status: "pending", summary: "", recommendations: [] } : null,
    }
    setActiveScan(newScan)
    setStats((s) => ({ ...s, activeScans: s.activeScans + 1 }))
    setActiveTab("live")
  }, [])

  const handleRescan = useCallback((id: string) => {
    const item = history.find((h) => h.id === id)
    if (item) {
      handleStartScan({ repoPath: item.repoPath, scanType: "full", deepScan: false, aiAnalysis: true, includeNodeModules: false })
    }
  }, [history, handleStartScan])

  const handleDeleteHistory = useCallback((id: string) => {
    setHistory((h) => h.filter((item) => item.id !== id))
  }, [])

  const handleViewDetails = useCallback((id: string) => {
    // In a real app, this would navigate to a details view
    console.log("View details for:", id)
  }, [])

  const handleSaveSettings = useCallback((newSettings: SettingsConfig) => {
    setSettings(newSettings)
  }, [])

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-12 flex-shrink-0 border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-foreground">Security Operations</h1>
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-secondary rounded">
              {stats.totalScanned} repos scanned
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Last sync: just now</span>
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
        </header>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {/* Overview - Always visible at top */}
            {(activeTab === "overview" || activeTab === "scan" || activeTab === "live") && (
              <OverviewPanel stats={stats} />
            )}

            {/* Tab Content */}
            {activeTab === "overview" && (
              <>
                <ScanForm onStartScan={handleStartScan} />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <LiveScanPanel scan={activeScan} />
                  <HistoryPanel
                    history={history.slice(0, 5)}
                    onRescan={handleRescan}
                    onDelete={handleDeleteHistory}
                    onViewDetails={handleViewDetails}
                  />
                </div>
                <SettingsPanel settings={settings} onSave={handleSaveSettings} />
              </>
            )}

            {activeTab === "scan" && (
              <ScanForm onStartScan={handleStartScan} />
            )}

            {activeTab === "live" && (
              <LiveScanPanel scan={activeScan} />
            )}

            {activeTab === "history" && (
              <HistoryPanel
                history={history}
                onRescan={handleRescan}
                onDelete={handleDeleteHistory}
                onViewDetails={handleViewDetails}
              />
            )}

            {activeTab === "settings" && (
              <SettingsPanel settings={settings} onSave={handleSaveSettings} />
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
