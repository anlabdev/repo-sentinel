import { Icon } from "./Icon.js";
import type { CopySet } from "../data/ui.js";
import type { IconName, OverviewStatsValue } from "../types/ui.js";
import { formatNumber } from "../utils/format.js";

export function OverviewStats({ stats, copy }: { stats: OverviewStatsValue; copy: CopySet }) {
  const cards = [
    { key: "risk", title: copy.riskScore, value: stats.riskScore, suffix: "/100", note: "", icon: "shield" as IconName, tone: "success" },
    { key: "active", title: copy.activeScans, value: stats.activeScans, suffix: copy.running, note: `${formatNumber(stats.totalScanned)} ${copy.reposScannedToday}`, icon: "activity" as IconName, tone: "neutral" },
    { key: "high", title: copy.highRisk, value: stats.highRiskRepos, suffix: copy.reposFlagged, note: `${formatNumber(stats.threatsBlocked)} ${copy.threatsBlocked}`, icon: "alert" as IconName, tone: "danger" },
    { key: "ai", title: copy.aiEscalation, value: stats.aiEscalations, suffix: copy.pending, note: copy.aiAnalysisReady, icon: "sparkles" as IconName, tone: "neutral" },
    { key: "tokens", title: copy.totalTokens, value: stats.totalTokensUsed, suffix: "", note: copy.aiAnalysis, icon: "folder" as IconName, tone: "neutral" }
  ];

  return (
    <section className="rs-kpi-row">
      {cards.map((card) => (
        <article key={card.key} className={`rs-kpi-card ${card.tone} ${card.key === "risk" ? "is-risk" : ""}`}>
          <div className="rs-kpi-head">
            <span>{card.title}</span>
            <Icon name={card.icon} />
          </div>
          <div className="rs-kpi-main">
            <strong>{card.key === "risk" ? card.value : formatNumber(Number(card.value))}</strong>
            <small>{card.suffix}</small>
          </div>
          {card.key === "risk" ? <div className="rs-mini-bar"><span style={{ width: `${card.value}%` }} /></div> : null}
          {card.note ? <div className={`rs-kpi-note ${card.key}`}>{card.note}</div> : null}
        </article>
      ))}
    </section>
  );
}
