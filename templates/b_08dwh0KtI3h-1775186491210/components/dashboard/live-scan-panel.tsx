"use client"

import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertTriangle,
  FileWarning,
  CheckCircle2,
  XCircle,
  Sparkles,
  Clock,
  FileCode,
  Loader2,
} from "lucide-react"

export interface ScanProgress {
  id: string
  repoName: string
  progress: number
  status: "running" | "analyzing" | "complete" | "error"
  filesScanned: number
  totalFiles: number
  startedAt: Date
  findings: Finding[]
  suspiciousFiles: SuspiciousFile[]
  aiReview: AIReview | null
}

export interface Finding {
  id: string
  severity: "critical" | "high" | "medium" | "low"
  type: string
  file: string
  line: number
  message: string
}

export interface SuspiciousFile {
  path: string
  risk: number
  reason: string
}

export interface AIReview {
  status: "pending" | "processing" | "complete"
  summary: string
  recommendations: string[]
}

interface LiveScanPanelProps {
  scan: ScanProgress | null
}

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-muted text-muted-foreground",
}

export function LiveScanPanel({ scan }: LiveScanPanelProps) {
  if (!scan) {
    return (
      <div className="bg-card border border-border rounded p-4 flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <FileCode className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No active scan</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Start a new scan to see live progress</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {scan.status === "running" || scan.status === "analyzing" ? (
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
          ) : scan.status === "complete" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="text-xs font-medium text-foreground truncate max-w-[180px]">{scan.repoName}</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {scan.status === "analyzing" ? "AI Analyzing" : scan.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="tabular-nums">{scan.filesScanned}/{scan.totalFiles} files</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {Math.floor((Date.now() - scan.startedAt.getTime()) / 1000)}s
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-3 py-2 border-b border-border">
        <Progress value={scan.progress} className="h-1" />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Progress: {scan.progress}%</span>
          <span>{scan.findings.length} findings</span>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Findings */}
        <div className="p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3 w-3 text-destructive" />
            <span className="text-[10px] font-medium text-foreground uppercase tracking-wider">Findings</span>
            <span className="text-[10px] text-muted-foreground">({scan.findings.length})</span>
          </div>
          <ScrollArea className="h-[140px]">
            <div className="space-y-1 pr-2">
              {scan.findings.length === 0 ? (
                <p className="text-[10px] text-muted-foreground py-4 text-center">No findings yet</p>
              ) : (
                scan.findings.map((finding) => (
                  <div key={finding.id} className="bg-secondary/50 rounded px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-[9px] uppercase font-medium px-1 py-0.5 rounded", severityColors[finding.severity])}>
                        {finding.severity}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">{finding.type}</span>
                    </div>
                    <p className="text-[10px] text-foreground mt-0.5 truncate">{finding.message}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 font-mono truncate">{finding.file}:{finding.line}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Suspicious Files */}
        <div className="p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <FileWarning className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-medium text-foreground uppercase tracking-wider">Suspicious</span>
            <span className="text-[10px] text-muted-foreground">({scan.suspiciousFiles.length})</span>
          </div>
          <ScrollArea className="h-[140px]">
            <div className="space-y-1 pr-2">
              {scan.suspiciousFiles.length === 0 ? (
                <p className="text-[10px] text-muted-foreground py-4 text-center">No suspicious files</p>
              ) : (
                scan.suspiciousFiles.map((file, i) => (
                  <div key={i} className="bg-secondary/50 rounded px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-foreground font-mono truncate">{file.path}</span>
                      <span className={cn(
                        "text-[9px] tabular-nums font-medium px-1 rounded",
                        file.risk > 70 ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"
                      )}>
                        {file.risk}%
                      </span>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{file.reason}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* AI Review */}
        <div className="p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-chart-4" />
            <span className="text-[10px] font-medium text-foreground uppercase tracking-wider">AI Review</span>
            {scan.aiReview && (
              <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                {scan.aiReview.status}
              </Badge>
            )}
          </div>
          <ScrollArea className="h-[140px]">
            {!scan.aiReview ? (
              <p className="text-[10px] text-muted-foreground py-4 text-center">AI review not enabled</p>
            ) : scan.aiReview.status === "pending" ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-chart-4" />
                <p className="text-[10px] text-muted-foreground">Waiting for scan completion...</p>
              </div>
            ) : scan.aiReview.status === "processing" ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-chart-4" />
                <p className="text-[10px] text-muted-foreground">GPT-4 analyzing findings...</p>
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                <p className="text-[10px] text-foreground">{scan.aiReview.summary}</p>
                {scan.aiReview.recommendations.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground uppercase">Recommendations:</span>
                    {scan.aiReview.recommendations.map((rec, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground pl-2 border-l border-chart-4/40">
                        {rec}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
