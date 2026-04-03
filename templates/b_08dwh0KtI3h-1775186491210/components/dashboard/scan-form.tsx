"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FolderSearch, Play, GitBranch, Zap } from "lucide-react"

interface ScanFormProps {
  onStartScan: (config: ScanConfig) => void
}

export interface ScanConfig {
  repoPath: string
  scanType: string
  deepScan: boolean
  aiAnalysis: boolean
  includeNodeModules: boolean
}

export function ScanForm({ onStartScan }: ScanFormProps) {
  const [config, setConfig] = useState<ScanConfig>({
    repoPath: "",
    scanType: "full",
    deepScan: false,
    aiAnalysis: true,
    includeNodeModules: false,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (config.repoPath.trim()) {
      onStartScan(config)
    }
  }

  return (
    <div className="bg-card border border-border rounded p-3">
      <div className="flex items-center gap-2 mb-3">
        <FolderSearch className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">New Repository Scan</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="/path/to/repo or https://github.com/..."
              value={config.repoPath}
              onChange={(e) => setConfig({ ...config, repoPath: e.target.value })}
              className="h-8 text-xs bg-input border-border placeholder:text-muted-foreground/50"
            />
          </div>
          <Select value={config.scanType} onValueChange={(v) => setConfig({ ...config, scanType: v })}>
            <SelectTrigger className="w-28 h-8 text-xs bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full" className="text-xs">Full Scan</SelectItem>
              <SelectItem value="quick" className="text-xs">Quick Scan</SelectItem>
              <SelectItem value="diff" className="text-xs">Diff Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="deepScan"
              checked={config.deepScan}
              onCheckedChange={(c) => setConfig({ ...config, deepScan: c as boolean })}
              className="h-3.5 w-3.5"
            />
            <Label htmlFor="deepScan" className="text-[11px] text-muted-foreground cursor-pointer">
              Deep scan
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="aiAnalysis"
              checked={config.aiAnalysis}
              onCheckedChange={(c) => setConfig({ ...config, aiAnalysis: c as boolean })}
              className="h-3.5 w-3.5"
            />
            <Label htmlFor="aiAnalysis" className="text-[11px] text-muted-foreground cursor-pointer">
              AI analysis
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="nodeModules"
              checked={config.includeNodeModules}
              onCheckedChange={(c) => setConfig({ ...config, includeNodeModules: c as boolean })}
              className="h-3.5 w-3.5"
            />
            <Label htmlFor="nodeModules" className="text-[11px] text-muted-foreground cursor-pointer">
              Include node_modules
            </Label>
          </div>

          <div className="flex-1" />

          <Button type="submit" size="sm" className="h-7 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Play className="h-3 w-3" />
            Start Scan
          </Button>
        </div>
      </form>
    </div>
  )
}
