"use client"

import { cn } from "@/lib/utils"
import {
  Shield,
  Scan,
  History,
  Settings,
  AlertTriangle,
  Activity,
  FolderSearch,
  Sparkles,
} from "lucide-react"

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const navItems = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "scan", label: "New Scan", icon: FolderSearch },
  { id: "live", label: "Live Scan", icon: Scan },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
]

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-14 lg:w-48 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="h-12 flex items-center gap-2 px-3 border-b border-sidebar-border">
        <Shield className="h-5 w-5 text-primary flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground hidden lg:block">RepoSentinel</span>
      </div>
      
      <nav className="flex-1 py-2 px-1.5 lg:px-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors",
                  activeTab === item.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="hidden lg:block truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="hidden lg:block">Engine v2.4.1</span>
        </div>
      </div>
    </aside>
  )
}
