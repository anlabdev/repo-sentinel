import { useEffect, useRef, useState } from "react";
import type { SettingsResponse } from "../../../shared/src/index.js";
import { MODEL_OPTIONS, PARALLEL_SCAN_OPTIONS, type CopySet } from "../data/ui.js";
import { DropdownSelect } from "./DropdownSelect.js";
import { Icon } from "./Icon.js";

function formatCompactNumber(value: number) {
  return value.toLocaleString("vi-VN");
}

function parseDigits(value: string) {
  const digits = value.replace(/\D+/g, "");
  return digits ? Number(digits) : 0;
}

function parseAllowlistRule(rule: string) {
  return rule
    .split("@")
    .map((part) => {
      const [kind, ...rest] = part.split(":");
      const value = rest.join(":").trim();
      const normalizedKind = (kind ?? "").trim();
      return {
        kind: normalizedKind || "rule",
        value: value || part.trim()
      };
    })
    .filter((entry) => entry.value);
}

type SettingsPanelProps = {
  settings: SettingsResponse;
  saving: boolean;
  isDirty: boolean;
  setSettings: React.Dispatch<React.SetStateAction<SettingsResponse | null>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onReset: () => void;
  onValidateAi: (input?: { openAiApiKey?: string; openAiModel?: string }) => Promise<void>;
  validatingAi: boolean;
  compact?: boolean;
  showFindingAllowlist?: boolean;
  highlightedAllowlistRule?: string | null;
  copy: CopySet;
};

export function SettingsPanel({
  settings,
  saving,
  isDirty,
  setSettings,
  onSubmit,
  onReset,
  onValidateAi,
  validatingAi,
  compact,
  showFindingAllowlist = !compact,
  highlightedAllowlistRule,
  copy
}: SettingsPanelProps) {
  const aiReady = settings.openAi.validationStatus === "valid";
  const modelOptions = settings.openAi.availableModels.map((value) => ({ value, label: value }));
  const budget = settings.openAi.budget;
  const usedPercent = budget.limitTokens > 0 ? Math.min(999, Math.round((budget.usedTokens / budget.limitTokens) * 100)) : 0;
  const usedSummary = budget.limitTokens > 0
    ? `${formatCompactNumber(budget.usedTokens)}/${formatCompactNumber(budget.limitTokens)} (${usedPercent}%)`
    : formatCompactNumber(budget.usedTokens);
  const openAiStatusOk = aiReady && budget.status === "ok";
  const openAiStatusTitle = [
    settings.openAi.validationMessage,
    budget.status !== "ok" ? (budget.status === "exceeded" ? copy.aiBudgetExceeded : copy.aiBudgetWarning) : undefined
  ].filter(Boolean).join("\n");
  const allowlistRules = settings.findingAllowlist;
  const [copiedAllowlistPart, setCopiedAllowlistPart] = useState<string | null>(null);
  const highlightedRuleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlightedAllowlistRule || !highlightedRuleRef.current) return;
    highlightedRuleRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedAllowlistRule, allowlistRules]);

  return (
    <section className="rs-panel rs-panel-floating">
      <div className="rs-panel-header rs-panel-header-split">
        <span><Icon name="settings" />{copy.settings}</span>
        {isDirty ? (
          <div className="rs-header-actions">
            <button type="button" className="rs-secondary rs-secondary-compact" onClick={onReset}><Icon name="rotate" />{copy.reset}</button>
            <button className="rs-primary rs-primary-compact" type="submit" form="settings-form"><Icon name="save" />{saving ? copy.saving : copy.save}</button>
          </div>
        ) : null}
      </div>
      <form id="settings-form" className={`rs-settings-grid ${compact ? "compact" : ""}`} onSubmit={onSubmit}>
        <div className="rs-settings-block">
          <h4>{copy.thresholds}</h4>
          <div className="rs-setting-line"><span>{copy.riskThreshold}</span><b>{settings.suspicionThreshold}%</b></div>
          <input type="range" min={1} max={100} value={settings.suspicionThreshold} style={{ "--range-fill": `${settings.suspicionThreshold}%` } as React.CSSProperties} onChange={(event) => setSettings((current) => current ? { ...current, suspicionThreshold: Number(event.target.value) } : current)} />
          <div className="rs-setting-line"><span>{copy.autoEscalate}</span><b>85%</b></div>
          <input type="range" min={1} max={100} value={85} style={{ "--range-fill": "85%" } as React.CSSProperties} readOnly />
          <label><span>{copy.parallelScans}</span><DropdownSelect value={String(settings.parallelScans)} options={PARALLEL_SCAN_OPTIONS} onChange={(value) => setSettings((current) => current ? { ...current, parallelScans: Number(value) } : current)} compact /></label>
          <label className="rs-stack rs-settings-retention-field"><span>{copy.scanRetentionLimit}</span><input className="rs-settings-budget-input rs-settings-retention-input" type="text" inputMode="numeric" value={formatCompactNumber(settings.scanRetentionLimit)} onChange={(event) => { const nextValue = Math.min(5000, Math.max(20, parseDigits(event.target.value || "20") || 20)); setSettings((current) => current ? { ...current, scanRetentionLimit: nextValue } : current); }} /></label>
        </div>

        <div className="rs-settings-block rs-settings-block-openai">
          <div className="rs-settings-head-inline">
            <h4>OpenAI</h4>
            <span className={`rs-settings-status ${openAiStatusOk ? "is-valid" : "is-invalid"}`} title={openAiStatusTitle || undefined} aria-label={openAiStatusTitle || undefined}>
              <Icon name={openAiStatusOk ? "check" : "close"} />
            </span>
          </div>

          <label className="rs-stack">
            <span>{copy.apiKey}</span>
            <div className="rs-settings-inline">
              <input
                className="rs-settings-api-input"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                name="openai-api-token"
                value={settings.openAi.apiKeyInput ?? ""}
                placeholder={settings.openAi.apiKeyPreview ?? "sk-..."}
                onChange={(event) => setSettings((current) => current ? { ...current, openAi: { ...current.openAi, apiKeyInput: event.target.value } } : current)}
                onBlur={() => {
                  if ((settings.openAi.apiKeyInput ?? "").trim() || settings.openAi.validationStatus !== "valid") {
                    void onValidateAi({ openAiApiKey: settings.openAi.apiKeyInput, openAiModel: settings.openAiModel });
                  }
                }}
              />
              <button type="button" className="rs-secondary rs-secondary-compact" onClick={() => setSettings((current) => current ? { ...current, enableOpenAi: false, openAi: { ...current.openAi, apiKeyInput: "", apiKeyPreview: undefined, validationStatus: "missing", validationMessage: "OpenAI API key is missing." } } : current)}>{copy.delete}</button>
            </div>
          </label>

          <label>
            <span>{copy.model}</span>
            <DropdownSelect
              value={settings.openAiModel}
              options={modelOptions.length ? modelOptions : MODEL_OPTIONS}
              onChange={(value) => {
                setSettings((current) => current ? { ...current, openAiModel: value, openAi: { ...current.openAi, model: value } } : current);
                void onValidateAi({ openAiApiKey: settings.openAi.apiKeyInput, openAiModel: value });
              }}
              compact
            />
          </label>

          <div className="rs-settings-budget-inline">
            <label className="rs-stack rs-settings-budget-limit-field">
              <span>{copy.aiTokenBudget}</span>
              <input className="rs-settings-budget-input" type="text" inputMode="numeric" value={formatCompactNumber(settings.aiTokenLimit)} onChange={(event) => { const nextValue = parseDigits(event.target.value); setSettings((current) => current ? { ...current, aiTokenLimit: nextValue, openAi: { ...current.openAi, budget: { ...current.openAi.budget, limitTokens: nextValue } } } : current); }} />
            </label>
            <label className="rs-stack rs-settings-budget-warning-field">
              <span className="rs-budget-warning-label">{copy.aiTokenWarningThreshold.startsWith("Warn") ? "Warn (%)" : "Cảnh báo (%)"}</span>
              <input className="rs-settings-budget-input" type="text" inputMode="numeric" value={String(settings.aiTokenWarningPercent)} onChange={(event) => { const nextValue = Math.min(100, Math.max(1, parseDigits(event.target.value || "1") || 1)); setSettings((current) => current ? { ...current, aiTokenWarningPercent: nextValue, openAi: { ...current.openAi, budget: { ...current.openAi.budget, warningPercent: nextValue } } } : current); }} />
            </label>
          </div>

          <div className="rs-setting-line rs-setting-line-strong"><span>{copy.tokensUsedLabel}</span><b>{usedSummary}</b></div>
          <div className="rs-setting-line"><span>{copy.tokensRemainingLabel}</span><b>{formatCompactNumber(budget.remainingTokens)}</b></div>

          {showFindingAllowlist ? (
            <label className="rs-stack rs-settings-allowlist-field">
              <span>{copy.findingAllowlist}</span>
              {allowlistRules.length ? (
                <div className="rs-settings-allowlist-list">
                  {allowlistRules.map((rule) => {
                    const isHighlighted = highlightedAllowlistRule === rule;
                    return (
                      <div
                        className={`rs-settings-allowlist-item ${isHighlighted ? "is-highlighted" : ""}`.trim()}
                        key={rule}
                        ref={isHighlighted ? highlightedRuleRef : null}
                      >
                        <div className="rs-settings-allowlist-copy">
                          <div className="rs-settings-allowlist-badges">
                            {parseAllowlistRule(rule).map((part, index) => {
                              const partKey = `${rule}-${part.kind}-${index}`;
                              const partClass = `rs-settings-allowlist-badge is-${part.kind.replace(/[^a-z-]/gi, "").toLowerCase() || "rule"} ${copiedAllowlistPart === partKey ? "is-copied" : ""}`.trim();
                              return (
                                <button
                                  type="button"
                                  className={partClass}
                                  key={partKey}
                                  title={part.value}
                                  onClick={async () => {
                                    if (!navigator?.clipboard?.writeText) return;
                                    await navigator.clipboard.writeText(`${part.kind}:${part.value}`);
                                    setCopiedAllowlistPart(partKey);
                                    window.setTimeout(() => setCopiedAllowlistPart((current) => current === partKey ? null : current), 1200);
                                  }}
                                >
                                  <b>{part.kind}</b>
                                  <em>{part.value}</em>
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            className={`rs-settings-allowlist-rule ${copiedAllowlistPart === `${rule}-full` ? "is-copied" : ""} ${isHighlighted ? "is-highlighted" : ""}`.trim()}
                            title={rule}
                            onClick={async () => {
                              if (!navigator?.clipboard?.writeText) return;
                              await navigator.clipboard.writeText(rule);
                              setCopiedAllowlistPart(`${rule}-full`);
                              window.setTimeout(() => setCopiedAllowlistPart((current) => current === `${rule}-full` ? null : current), 1200);
                            }}
                          >
                            <code>{rule}</code>
                          </button>
                        </div>

                        <button type="button" className="rs-secondary rs-secondary-compact rs-settings-allowlist-remove" onClick={() => setSettings((current) => current ? { ...current, findingAllowlist: current.findingAllowlist.filter((entry) => entry !== rule) } : current)}><Icon name="trash" />{copy.delete}</button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <textarea className="rs-settings-textarea" rows={5} value={settings.findingAllowlist.join("\n")} placeholder={"rule:filename-risk\npath:docs/\nrule:artifact.executable.package@path:fixtures/"} onChange={(event) => { const nextValue = event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); setSettings((current) => current ? { ...current, findingAllowlist: nextValue } : current); }} />
              <small>{copy.findingAllowlistHint}</small>
            </label>
          ) : null}
        </div>

        <div className="rs-settings-block">
          <h4>{copy.scanners}</h4>
          {([
            { key: "builtIn", label: copy.builtIn, description: "" },
            { key: "semgrep", label: "semgrep", description: copy.staticAnalysis },
            { key: "trivy", label: "trivy", description: copy.dependencyScanning },
            { key: "osvScanner", label: "osvScanner", description: copy.osvDatabase },
            { key: "yara", label: "yara", description: copy.patternMatching }
          ] as const).map((scanner) => (
            <label key={scanner.key} className="rs-toggle rs-switch rs-switch-row">
              <span><strong>{scanner.label}</strong>{scanner.description ? <small>{scanner.description}</small> : null}</span>
              <input type="checkbox" checked={settings.scannerToggles[scanner.key]} onChange={(event) => setSettings((current) => current ? { ...current, scannerToggles: { ...current.scannerToggles, [scanner.key]: event.target.checked } } : current)} />
            </label>
          ))}
          <div className="rs-divider" />
          <label className="rs-toggle rs-switch rs-switch-row"><span><strong>{copy.aiAnalysis}</strong>{!aiReady ? <small>{settings.openAi.validationMessage ?? "OpenAI not ready"}</small> : null}</span><input type="checkbox" checked={settings.enableOpenAi && aiReady} disabled={!aiReady || validatingAi} onChange={(event) => setSettings((current) => current ? { ...current, enableOpenAi: event.target.checked } : current)} /></label>
        </div>
      </form>
    </section>
  );
}
