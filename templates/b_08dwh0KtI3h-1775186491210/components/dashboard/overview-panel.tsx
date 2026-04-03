"use client"

import { cn } from "@/lib/utils"
import {
  Shield,
  AlertTriangle,
  Activity,
  Sparkles,
  TrendingUp,
  TrendingDown,
} from "lucide-react"

interface OverviewPanelProps {
  stats: {
    riskScore: number
    activeScans: number
    highRiskRepos: number
    aiEscalations: number
    totalScanned: number
    threatsBlocked: number
  }
}

export function OverviewPanel({ stats }: OverviewPanelProps) {
  const riskColor = stats.riskScore > 70 ? "text-destructive" : stats.riskScore > 40 ? "text-warning" : "text-primary"
  const riskBg = stats.riskScore > 70 ? "bg-destructive/10" : stats.riskScore > 40 ? "bg-warning/10" : "bg-primary/10"

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {/* Risk Score */}
      <div className={cn("bg-card border border-border rounded p-3", riskBg, "border-none")}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Risk Score</span>
          <Shield className={cn("h-3.5 w-3.5", riskColor)} />
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className={cn("text-2xl font-bold tabular-nums", riskColor)}>{stats.riskScore}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
        <div className="mt-1.5 h-1 bg-secondary rounded-full overflow-hidden">
          <div 
            className={cn("h-full rounded-full transition-all", 
              stats.riskScore > 70 ? "bg-destructive" : stats.riskScore > 40 ? "bg-warning" : "bg-primary"
            )} 
            style={{ width: `${stats.riskScore}%` }} 
          />
        </div>
      </div>

      {/* Active Scans */}
      <div className="bg-card border border-border rounded p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Active Scans</span>
          <Activity className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-foreground">{stats.activeScans}</span>
          <span className="text-[10px] text-muted-foreground">running</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
          <TrendingUp className="h-3 w-3" />
          <span>{stats.totalScanned} repos scanned today</span>
        </div>
      </div>

      {/* High Risk Repos */}
      <div className="bg-card border border-border rounded p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">High Risk</span>
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-destructive">{stats.highRiskRepos}</span>
          <span className="text-[10px] text-muted-foreground">repos flagged</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-destructive">
          <TrendingDown className="h-3 w-3" />
          <span>{stats.threatsBlocked} threats blocked</span>
        </div>
      </div>

      {/* AI Escalations */}
      <div className="bg-card border border-border rounded p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">AI Escalation</span>
          <Sparkles className="h-3.5 w-3.5 text-chart-4" />
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-foreground">{stats.aiEscalations}</span>
          <span className="text-[10px] text-muted-foreground">pending</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-chart-4 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">GPT-4 analysis ready</span>
        </div>
      </div>
    </div>
  )
}
