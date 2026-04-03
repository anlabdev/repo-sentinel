import { useState } from "react";
import type { RepositoryFetchMode, UiLanguage } from "../../../shared/src/index.js";
import { FETCH_MODE_OPTIONS, type CopySet } from "../data/ui.js";
import type { FormState } from "../types/ui.js";
import { DropdownSelect } from "./DropdownSelect.js";
import { Icon } from "./Icon.js";

export function ScanFormCard({
  form,
  setForm,
  onSubmit,
  copy,
  language
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  copy: CopySet;
  language: UiLanguage;
}) {
  const isUpload = form.fetchMode === "upload";
  const [dragActive, setDragActive] = useState(false);

  function setUploadFile(file: File | null) {
    setForm((current) => ({
      ...current,
      fetchMode: file ? "upload" : current.fetchMode,
      uploadFile: file,
      repoUrl: file ? file.name : current.repoUrl
    }));
  }

  function handleFetchModeChange(value: RepositoryFetchMode) {
    setForm((current) => ({
      ...current,
      fetchMode: value,
      uploadFile: value === "upload" ? current.uploadFile : null,
      repoUrl: value === "upload" ? current.repoUrl : (current.uploadFile ? "" : current.repoUrl)
    }));
  }

  return (
    <section className="rs-panel rs-panel-floating">
      <div className="rs-panel-header"><Icon name="folder" /><span>{copy.newRepositoryScan}</span></div>
      <form className="rs-scan-form" onSubmit={onSubmit}>
        <div className="rs-scan-top rs-scan-top-flex">
          <div
            className={`rs-upload-box ${dragActive ? "is-drag" : ""} ${isUpload ? "is-upload" : ""}`.trim()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file && /\.zip$/i.test(file.name)) setUploadFile(file);
            }}
          >
            {isUpload ? (
              <div className="rs-upload-value" title={form.uploadFile?.name ?? form.repoUrl}>{form.uploadFile?.name ?? (form.repoUrl || copy.noZipSelected)}</div>
            ) : (
              <input
                required
                type="url"
                value={form.repoUrl}
                placeholder={language === "vi" ? "/đường-dẫn/tới/kho-mã hoặc https://github.com/..." : "/path/to/repo or https://github.com/..."}
                onChange={(event) => setForm((current) => ({ ...current, repoUrl: event.target.value }))}
              />
            )}
            {isUpload && form.uploadFile ? (
              <button
                type="button"
                className="rs-upload-clear"
                aria-label={language === "vi" ? "Bỏ file zip" : "Clear zip file"}
                onClick={() => setForm((current) => ({ ...current, fetchMode: "clone", uploadFile: null, repoUrl: "" }))}
              >
                <Icon name="close" />
              </button>
            ) : null}
            <label className="rs-upload-trigger">
              <span>{copy.chooseZip}</span>
              <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <DropdownSelect
            value={form.fetchMode}
            options={FETCH_MODE_OPTIONS[language]}
            onChange={(value) => handleFetchModeChange(value as RepositoryFetchMode)}
          />
        </div>
        <div className="rs-scan-bottom">
          <div className="rs-checks">
            <label><input type="checkbox" checked={form.deepScan} onChange={(event) => setForm((current) => ({ ...current, deepScan: event.target.checked }))} /><span>{copy.deepScan}</span></label>
            <label><input type="checkbox" checked={form.allowAi} onChange={(event) => setForm((current) => ({ ...current, allowAi: event.target.checked }))} /><span>{copy.aiAnalysis}</span></label>
            <label><input type="checkbox" checked={form.includeNodeModules} onChange={(event) => setForm((current) => ({ ...current, includeNodeModules: event.target.checked }))} /><span>{copy.includeNodeModules}</span></label>
          </div>
          <div className="rs-grow" />
          <button className="rs-primary" type="submit"><Icon name="play" />{copy.startScan}</button>
        </div>
      </form>
    </section>
  );
}
