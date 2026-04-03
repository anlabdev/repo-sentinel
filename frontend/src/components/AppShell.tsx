import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { UiLanguage } from "../../../shared/src/index.js";
import type { ScanListItem } from "../api/client.js";
import { NAV_ITEMS, type CopySet } from "../data/ui.js";
import type { Tab } from "../types/ui.js";
import { formatNumber, navLabel } from "../utils/format.js";
import { Icon } from "./Icon.js";

type CommandItem = {
  key: string;
  label: string;
  icon: (typeof NAV_ITEMS)[number]["icon"];
  meta?: string;
  highlight?: string;
  action: () => void;
};

type CommandSection = {
  key: string;
  title: string;
  items: CommandItem[];
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(text: string, query?: string): ReactNode {
  if (!query) return text;
  const source = query.trim();
  if (!source) return text;
  const matcher = new RegExp(`(${escapeRegExp(source)})`, "ig");
  const parts = text.split(matcher);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    part.toLowerCase() === source.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part
  );
}

export function AppShell({
  tab,
  setTab,
  language,
  setLanguage,
  copy,
  totalScanned,
  scans,
  onOpenScanCommand,
  children
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  copy: CopySet;
  totalScanned: number;
  scans: ScanListItem[];
  onOpenScanCommand: (id: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const baseCommandItems = useMemo<CommandItem[]>(() => {
    return NAV_ITEMS.map((item) => ({
      key: item.id,
      label: navLabel(item.id, copy),
      icon: item.icon,
      meta: language === "vi" ? "Mở màn hình" : "Open screen",
      action: () => setTab(item.id)
    }));
  }, [copy, language, setTab]);

  const slashItems = useMemo<CommandItem[]>(() => {
    return [
      {
        key: "slash-help",
        label: "/h",
        icon: "help",
        meta: language === "vi" ? "Mở màn trợ giúp" : "Open help screen",
        action: () => setTab("help")
      },
      {
        key: "slash-history",
        label: "/hs",
        icon: "history",
        meta: language === "vi" ? "Tìm trong lịch sử scan và mở report" : "Search scan history and open a report",
        action: () => setTab("history")
      }
    ];
  }, [language, setTab]);

  const visibleCommandSections = useMemo<CommandSection[]>(() => {
    const raw = commandQuery.trim();
    const normalized = normalizeSearch(raw);
    const navigationTitle = language === "vi" ? "Điều hướng" : "Navigation";
    const slashTitle = "Slash commands";
    const historyTitle = language === "vi" ? "Lịch sử scan" : "Scan history";

    if (!normalized) {
      return [{ key: "navigation", title: navigationTitle, items: baseCommandItems }];
    }

    if (raw.startsWith("/")) {
      const slashMatches = slashItems.filter(
        (item) => normalizeSearch(item.label).startsWith(normalized) || normalized.startsWith(normalizeSearch(item.label))
      );

      if (normalized === "/" || normalized === "/h") {
        return slashMatches.length ? [{ key: "slash", title: slashTitle, items: slashMatches }] : [];
      }

      if (normalized.startsWith("/hs")) {
        const historyFilter = normalizeSearch(raw.slice(3));
        const historyItems: CommandItem[] = scans
          .filter((scan) => {
            if (!historyFilter) return true;
            const haystack = normalizeSearch(`${scan.repoName} ${scan.repoUrl} ${scan.branch ?? ""}`);
            return haystack.includes(historyFilter);
          })
          .slice(0, 12)
          .map((scan) => ({
            key: `scan-${scan.id}`,
            label: scan.repoName,
            icon: "history" as const,
            meta: scan.repoUrl,
            highlight: raw.slice(3).trim(),
            action: () => {
              void onOpenScanCommand(scan.id);
            }
          }));

        const sections: CommandSection[] = [];
        const slashHistoryItem = slashItems.find((item) => item.key === "slash-history");
        if (slashHistoryItem) {
          sections.push({ key: "slash", title: slashTitle, items: [slashHistoryItem] });
        }
        if (historyItems.length) {
          sections.push({ key: "history", title: historyTitle, items: historyItems });
        }
        return sections;
      }

      return slashMatches.length ? [{ key: "slash", title: slashTitle, items: slashMatches }] : [];
    }

    const navigationItems = baseCommandItems.filter((item) => normalizeSearch(item.label).includes(normalized));
    return navigationItems.length ? [{ key: "navigation", title: navigationTitle, items: navigationItems }] : [];
  }, [baseCommandItems, commandQuery, language, onOpenScanCommand, scans, slashItems]);

  const visibleCommandItems = useMemo(
    () => visibleCommandSections.flatMap((section) => section.items),
    [visibleCommandSections]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [commandQuery, commandOpen]);

  useEffect(() => {
    if (activeIndex >= visibleCommandItems.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, visibleCommandItems.length]);

  useEffect(() => {
    if (!commandOpen) return;
    const activeItem = document.querySelector<HTMLButtonElement>(".rs-command-item.is-active");
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, commandOpen, visibleCommandItems]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!commandOpen && event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (!commandOpen) return;

      if (event.ctrlKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setActiveIndex((current) => (visibleCommandItems.length ? (current + 1) % visibleCommandItems.length : 0));
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveIndex((current) => (visibleCommandItems.length ? (current - 1 + visibleCommandItems.length) % visibleCommandItems.length : 0));
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setCommandOpen(false);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".rs-command-input");
        const activeButton = document.querySelector<HTMLButtonElement>(".rs-command-item.is-active");
        const activeElement = document.activeElement;

        if (activeElement === input && activeButton) {
          activeButton.focus();
        } else {
          input?.focus();
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (visibleCommandItems.length ? (current + 1) % visibleCommandItems.length : 0));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (visibleCommandItems.length ? (current - 1 + visibleCommandItems.length) % visibleCommandItems.length : 0));
        return;
      }

      if (event.key === "Enter" && visibleCommandItems[activeIndex]) {
        event.preventDefault();
        visibleCommandItems[activeIndex].action();
        setCommandOpen(false);
        setCommandQuery("");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, commandOpen, visibleCommandItems]);

  useEffect(() => {
    if (!commandOpen) {
      setCommandQuery("");
    }
  }, [commandOpen]);

  function runCommand(item: CommandItem) {
    item.action();
    setCommandOpen(false);
    setCommandQuery("");
  }

  return (
    <div className="rs-shell">
      <aside className="rs-sidebar">
        <div className="rs-brand">
          <Icon name="shield" />
          <span>RepoSentinel</span>
        </div>

        <nav className="rs-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <span>
                <Icon name={item.icon} />
                {navLabel(item.id, copy)}
              </span>
            </button>
          ))}
        </nav>

        <div className="rs-sidebar-footer">Engine v1.0.0</div>
      </aside>

      <main className="rs-main">
        <header className="rs-topbar">
          <div className="rs-topbar-left">
            <strong>{copy.securityOperations}</strong>
            <span>{formatNumber(totalScanned)} {copy.reposScanned}</span>
          </div>
          <div className="rs-topbar-right">
            <button type="button" className="rs-secondary rs-secondary-compact rs-command-trigger" aria-label={copy.commandLabel} onClick={() => setCommandOpen(true)}>
              <Icon name="sparkles" />
              <kbd>Ctrl + K</kbd>
            </button>
            <div className="rs-language-switch">
              <button type="button" className={language === "vi" ? "active" : ""} onClick={() => setLanguage("vi")}>VI</button>
              <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
            </div>
            <span>{copy.lastSync}: {copy.justNow}</span>
            <i />
          </div>
        </header>

        {children}
      </main>

      {commandOpen ? (
        <div className="rs-command-overlay" onClick={() => setCommandOpen(false)}>
          <div className="rs-command-panel" onClick={(event) => event.stopPropagation()}>
            <div className="rs-command-panel-head">
              <strong>{copy.commandLabel}</strong>
              <kbd>Ctrl + K</kbd>
            </div>
            <input
              autoFocus
              className="rs-command-input"
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder={language === "vi" ? "Gõ tên màn hình, /h hoặc /hs repo..." : "Type a screen name, /h, or /hs repo..."}
            />
            <div className="rs-command-hint">
              {language === "vi"
                ? "↑↓ / Ctrl+J Ctrl+K để di chuyển, Enter để mở, Esc để đóng, Tab để đổi focus."
                : "Use ↑↓ or Ctrl+J Ctrl+K to move, Enter to open, Esc to close, Tab to switch focus."}
            </div>
            <div className="rs-command-list">
              {visibleCommandSections.length ? (
                visibleCommandSections.map((section) => (
                  <div key={section.key} className="rs-command-group">
                    <div className="rs-command-group-title">{section.title}</div>
                    {section.items.map((item) => {
                      const index = visibleCommandItems.findIndex((candidate) => candidate.key === item.key);
                      return (
                        <button key={item.key} type="button" className={`rs-command-item ${index === activeIndex ? "is-active" : ""}`.trim()} onClick={() => runCommand(item)}>
                          <Icon name={item.icon} />
                          <div className="rs-command-item-copy">
                            <span>{renderHighlightedText(item.label, item.highlight)}</span>
                            {item.meta ? <small>{renderHighlightedText(item.meta, item.highlight)}</small> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="rs-command-empty">{language === "vi" ? "Không có mục phù hợp." : "No matching screen."}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
