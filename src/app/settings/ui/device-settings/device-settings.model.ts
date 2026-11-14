import { ChangeColorSetting, ColorSchemeSetting } from '@app/settings/domain/models/settings.model';

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
