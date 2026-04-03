import type { UiLanguage } from "../../../shared/src/index.js";
import type { CopySet } from "../data/ui.js";
import type { FormState } from "../types/ui.js";
import { ScanFormCard } from "../components/ScanFormCard.js";

export function NewScanPage({ form, setForm, onSubmit, copy, language }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; copy: CopySet; language: UiLanguage }) {
  return <ScanFormCard form={form} setForm={setForm} onSubmit={onSubmit} copy={copy} language={language} />;
}
