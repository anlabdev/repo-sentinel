import type { SettingsResponse } from "../../../shared/src/index.js";
import type { CopySet } from "../data/ui.js";
import { SettingsPanel } from "../components/SettingsPanel.js";

export function SettingsPage(props: { settings: SettingsResponse; saving: boolean; settingsDirty: boolean; setSettings: React.Dispatch<React.SetStateAction<SettingsResponse | null>>; saveCurrentSettings: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; resetSettings: () => void; validateAiSettings: (input?: { openAiApiKey?: string; openAiModel?: string }) => Promise<void>; validatingAi: boolean; copy: CopySet }) {
  return <SettingsPanel settings={props.settings} saving={props.saving} isDirty={props.settingsDirty} setSettings={props.setSettings} onSubmit={props.saveCurrentSettings} onReset={props.resetSettings} onValidateAi={props.validateAiSettings} validatingAi={props.validatingAi} copy={props.copy} />;
}
