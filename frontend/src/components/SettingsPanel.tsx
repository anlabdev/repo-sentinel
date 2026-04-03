import type { SettingsResponse } from "../../../shared/src/index.js";
import { MODEL_OPTIONS, PARALLEL_SCAN_OPTIONS, type CopySet } from "../data/ui.js";
import { DropdownSelect } from "./DropdownSelect.js";
import { Icon } from "./Icon.js";

export function SettingsPanel({ settings, saving, isDirty, setSettings, onSubmit, onReset, onValidateAi, validatingAi, compact, copy }: { settings: SettingsResponse; saving: boolean; isDirty: boolean; setSettings: React.Dispatch<React.SetStateAction<SettingsResponse | null>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onReset: () => void; onValidateAi: (input?: { openAiApiKey?: string; openAiModel?: string }) => Promise<void>; validatingAi: boolean; compact?: boolean; copy: CopySet }) {
  const aiReady = settings.openAi.validationStatus === "valid";
  const modelOptions = settings.openAi.availableModels.map((value) => ({ value, label: value }));

  return (
    <section className="rs-panel rs-panel-floating">
      <div className="rs-panel-header rs-panel-header-split">
        <span><Icon name="settings" />{copy.settings}</span>
        {isDirty ? <div className="rs-header-actions"><button type="button" className="rs-secondary rs-secondary-compact" onClick={onReset}><Icon name="rotate" />{copy.reset}</button><button className="rs-primary rs-primary-compact" type="submit" form="settings-form"><Icon name="save" />{saving ? copy.saving : copy.save}</button></div> : null}
      </div>
      <form id="settings-form" className={`rs-settings-grid ${compact ? "compact" : ""}`} onSubmit={onSubmit}>
        <div className="rs-settings-block">
          <h4>{copy.thresholds}</h4>
          <div className="rs-setting-line"><span>{copy.riskThreshold}</span><b>{settings.suspicionThreshold}%</b></div>
          <input type="range" min={1} max={100} value={settings.suspicionThreshold} style={{ "--range-fill": `${settings.suspicionThreshold}%` } as React.CSSProperties} onChange={(event) => setSettings((current) => current ? { ...current, suspicionThreshold: Number(event.target.value) } : current)} />
          <div className="rs-setting-line"><span>{copy.autoEscalate}</span><b>85%</b></div>
          <input type="range" min={1} max={100} value={85} style={{ "--range-fill": "85%" } as React.CSSProperties} readOnly />
          <label><span>{copy.parallelScans}</span><DropdownSelect value="4" options={PARALLEL_SCAN_OPTIONS} onChange={() => {}} compact /></label>
        </div>
        <div className="rs-settings-block">
          <h4>OpenAI</h4>
          <label className="rs-stack"><span>{copy.apiKey}</span><div className="rs-settings-inline"><input type="password" value={settings.openAi.apiKeyInput ?? ""} placeholder={settings.openAi.apiKeyPreview ?? "sk-..."} onChange={(event) => setSettings((current) => current ? { ...current, openAi: { ...current.openAi, apiKeyInput: event.target.value } } : current)} onBlur={() => { if ((settings.openAi.apiKeyInput ?? "").trim() || settings.openAi.validationStatus !== "valid") void onValidateAi({ openAiApiKey: settings.openAi.apiKeyInput, openAiModel: settings.openAiModel }); }} /><button type="button" className="rs-secondary rs-secondary-compact" onClick={() => setSettings((current) => current ? { ...current, enableOpenAi: false, openAi: { ...current.openAi, apiKeyInput: "", apiKeyPreview: undefined, validationStatus: "missing", validationMessage: "OpenAI API key is missing." } } : current)}>{copy.delete}</button></div></label>
          <label><span>{copy.model}</span><DropdownSelect value={settings.openAiModel} options={modelOptions.length ? modelOptions : MODEL_OPTIONS} onChange={(value) => { setSettings((current) => current ? { ...current, openAiModel: value, openAi: { ...current.openAi, model: value } } : current); void onValidateAi({ openAiApiKey: settings.openAi.apiKeyInput, openAiModel: value }); }} compact /></label>
          <div className={`rs-setting-note ${aiReady ? "valid" : "invalid"}`.trim()}>{validatingAi ? (copy.saving) : (settings.openAi.validationMessage ?? (aiReady ? "OpenAI ready" : "OpenAI not ready"))}</div>
        </div>
        <div className="rs-settings-block">
          <h4>{copy.scanners}</h4>
          {([{ key: "builtIn", label: copy.builtIn, description: "" }, { key: "semgrep", label: "semgrep", description: copy.staticAnalysis }, { key: "trivy", label: "trivy", description: copy.dependencyScanning }, { key: "osvScanner", label: "osvScanner", description: copy.osvDatabase }, { key: "yara", label: "yara", description: copy.patternMatching }] as const).map((scanner) => <label key={scanner.key} className="rs-toggle rs-switch rs-switch-row"><span><strong>{scanner.label}</strong>{scanner.description ? <small>{scanner.description}</small> : null}</span><input type="checkbox" checked={settings.scannerToggles[scanner.key]} onChange={(event) => setSettings((current) => current ? { ...current, scannerToggles: { ...current.scannerToggles, [scanner.key]: event.target.checked } } : current)} /></label>)}
          <div className="rs-divider" />
          <label className="rs-toggle rs-switch rs-switch-row"><span><strong>{copy.aiAnalysis}</strong>{!aiReady ? <small>{settings.openAi.validationMessage ?? "OpenAI not ready"}</small> : null}</span><input type="checkbox" checked={settings.enableOpenAi && aiReady} disabled={!aiReady || validatingAi} onChange={(event) => setSettings((current) => current ? { ...current, enableOpenAi: event.target.checked } : current)} /></label>
        </div>
      </form>
    </section>
  );
}
