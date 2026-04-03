"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Settings,
  Key,
  Gauge,
  Shield,
  Sparkles,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
} from "lucide-react"

export interface SettingsConfig {
  riskThreshold: number
  autoEscalateThreshold: number
  openaiApiKey: string
  openaiModel: string
  enableYara: boolean
  enableSemgrep: boolean
  enableGitleaks: boolean
  enableTruffleHog: boolean
  autoScanOnPush: boolean
  parallelScans: number
}

interface SettingsPanelProps {
  settings: SettingsConfig
  onSave: (settings: SettingsConfig) => void
}

export function SettingsPanel({ settings: initialSettings, onSave }: SettingsPanelProps) {
  const [settings, setSettings] = useState<SettingsConfig>(initialSettings)
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const updateSetting = <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    onSave(settings)
    setHasChanges(false)
  }

  const handleReset = () => {
    setSettings(initialSettings)
    setHasChanges(false)
  }

  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Settings</span>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleReset}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button size="sm" className="h-6 text-[10px] px-2 bg-primary text-primary-foreground" onClick={handleSave}>
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        )}
      </div>

      <div className="p-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Thresholds */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-foreground uppercase tracking-wider">Thresholds</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Risk Threshold</Label>
              <span className="text-[11px] text-foreground tabular-nums font-medium">{settings.riskThreshold}%</span>
            </div>
            <Slider
              value={[settings.riskThreshold]}
              onValueChange={([v]) => updateSetting("riskThreshold", v)}
              max={100}
              step={5}
              className="h-1"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Auto-Escalate at</Label>
              <span className="text-[11px] text-foreground tabular-nums font-medium">{settings.autoEscalateThreshold}%</span>
            </div>
            <Slider
              value={[settings.autoEscalateThreshold]}
              onValueChange={([v]) => updateSetting("autoEscalateThreshold", v)}
              max={100}
              step={5}
              className="h-1"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Parallel Scans</Label>
            <Select
              value={settings.parallelScans.toString()}
              onValueChange={(v) => updateSetting("parallelScans", parseInt(v))}
            >
              <SelectTrigger className="h-7 text-[11px] bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 8].map((n) => (
                  <SelectItem key={n} value={n.toString()} className="text-[11px]">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* OpenAI */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-chart-4" />
            <span className="text-[10px] font-medium text-foreground uppercase tracking-wider">OpenAI</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={settings.openaiApiKey}
                onChange={(e) => updateSetting("openaiApiKey", e.target.value)}
                placeholder="sk-..."
                className="h-7 text-[11px] bg-input border-border pr-8 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Model</Label>
            <Select
              value={settings.openaiModel}
              onValueChange={(v) => updateSetting("openaiModel", v)}
            >
              <SelectTrigger className="h-7 text-[11px] bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4-turbo" className="text-[11px]">GPT-4 Turbo</SelectItem>
                <SelectItem value="gpt-4" className="text-[11px]">GPT-4</SelectItem>
                <SelectItem value="gpt-3.5-turbo" className="text-[11px]">GPT-3.5 Turbo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Scanners */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-foreground uppercase tracking-wider">Scanners</span>
          </div>

          <div className="space-y-2">
            {[
              { key: "enableYara" as const, label: "YARA Rules", desc: "Pattern matching" },
              { key: "enableSemgrep" as const, label: "Semgrep", desc: "Static analysis" },
              { key: "enableGitleaks" as const, label: "Gitleaks", desc: "Secret detection" },
              { key: "enableTruffleHog" as const, label: "TruffleHog", desc: "Credential scanner" },
            ].map((scanner) => (
              <div key={scanner.key} className="flex items-center justify-between py-1">
                <div>
                  <span className="text-[11px] text-foreground">{scanner.label}</span>
                  <span className="text-[9px] text-muted-foreground ml-1.5">{scanner.desc}</span>
                </div>
                <Switch
                  checked={settings[scanner.key]}
                  onCheckedChange={(c) => updateSetting(scanner.key, c)}
                  className="scale-75"
                />
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-[11px] text-foreground">Auto-scan on push</span>
              </div>
              <Switch
                checked={settings.autoScanOnPush}
                onCheckedChange={(c) => updateSetting("autoScanOnPush", c)}
                className="scale-75"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
