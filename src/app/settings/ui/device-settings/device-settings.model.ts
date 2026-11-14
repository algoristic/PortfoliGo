import { ChangeColorSetting, ColorSchemeSetting } from '@app/settings/domain/models/settings.model';
import { Language } from '@app/shared/util/locale';

export interface ColorSchemeOption {
  id: ColorSchemeSetting;
  label: string;
  hint: string;
  checked: boolean;
}

export interface ShortcutEntry {
  /** Key as shown in `<kbd>`. */
  key: string;
  label: string;
}

export interface ChangeColorOption {
  id: ChangeColorSetting;
  label: string;
  hint: string;
  checked: boolean;
}

export interface LanguageOption {
  id: Language;
  /** Name of the language in the language itself, never translated (PS US-UI-11). */
  label: string;
  checked: boolean;
}
