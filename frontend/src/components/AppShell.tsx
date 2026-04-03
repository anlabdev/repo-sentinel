import type { UiLanguage } from "../../../shared/src/index.js";
import { NAV_ITEMS, type CopySet } from "../data/ui.js";
import type { Tab } from "../types/ui.js";
import { navLabel } from "../utils/format.js";
import { Icon } from "./Icon.js";

export function AppShell({
  tab,
  setTab,
  language,
  setLanguage,
  copy,
  totalScanned,
  children
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  copy: CopySet;
  totalScanned: number;
  children: React.ReactNode;
}) {
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
            <span>{totalScanned} {copy.reposScanned}</span>
          </div>
          <div className="rs-topbar-right">
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
    </div>
  );
}
