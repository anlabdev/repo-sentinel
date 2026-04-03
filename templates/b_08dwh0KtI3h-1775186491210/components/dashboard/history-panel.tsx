"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  RotateCcw,
  Trash2,
} from "lucide-react"

export interface ScanHistoryItem {
  id: string
  repoName: string
  repoPath: string
  status: "clean" | "issues" | "critical" | "error"
  findings: number
  duration: number
  completedAt: Date
  scanType: string
}

interface HistoryPanelProps {
  history: ScanHistoryItem[]
  onRescan: (id: string) => void
  onDelete: (id: string) => void
  onViewDetails: (id: string) => void
}

const statusConfig = {
  clean: { icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10", label: "Clean" },
  issues: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: "Issues" },
  critical: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Critical" },
  error: { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted", label: "Error" },
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function HistoryPanel({ history, onRescan, onDelete, onViewDetails }: HistoryPanelProps) {
  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Scan History</span>
          <span className="text-[10px] text-muted-foreground">({history.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
            {history.filter(h => h.status === "clean").length} clean
          </Badge>
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/20">
            {history.filter(h => h.status === "critical" || h.status === "issues").length} flagged
          </Badge>
        </div>
      </div>

      <ScrollArea className="h-[220px]">
        <div className="divide-y divide-border">
          {history.length === 0 ? (
            <div className="py-8 text-center">
              <History className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No scan history</p>
            </div>
          ) : (
            history.map((item) => {
              const config = statusConfig[item.status]
              const StatusIcon = config.icon
              return (
                <div
                  key={item.id}
                  className="px-3 py-2 hover:bg-secondary/30 transition-colors group cursor-pointer"
                  onClick={() => onViewDetails(item.id)}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1 rounded", config.bg)}>
                      <StatusIcon className={cn("h-3 w-3", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground truncate">{item.repoName}</span>
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1">{item.scanType}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                          {item.repoPath}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="tabular-nums">{item.findings} findings</span>
                      <span className="tabular-nums">{item.duration}s</span>
                      <span className="tabular-nums w-12 text-right">{formatTimeAgo(item.completedAt)}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); onRescan(item.id) }}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
