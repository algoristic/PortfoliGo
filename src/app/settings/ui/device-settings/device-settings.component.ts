import { Component, computed, input, output } from '@angular/core';

import { ColorSchemeSetting } from '@app/settings/domain/models/settings.model';

import { ColorSchemeOption, ShortcutEntry } from './device-settings.model';

/** Settings of this device (PS US-UI-09): appearance (US-UI-01) and shortcuts (US-ZT-02). */
@Component({
  selector: 'app-device-settings',
  imports: [],
  templateUrl: './device-settings.component.html',
  host: { class: 'block' },
})
export class DeviceSettingsComponent {
  colorScheme = input<ColorSchemeSetting | null>();
  shortcutsEnabled = input<boolean | null>();

  selectedColorScheme = output<ColorSchemeSetting>();
  toggledShortcuts = output<boolean>();

  colorSchemeOptions = computed(() =>
    (
      [
        {
          id: 'dark',
          label: $localize`:@@uiSettings-deviceSettings-colorSchemeDark:Dunkel`,
          hint: $localize`:@@uiSettings-deviceSettings-colorSchemeDarkHint:Standard`,
        },
        {
          id: 'light',
          label: $localize`:@@uiSettings-deviceSettings-colorSchemeLight:Hell`,
          hint: '',
        },
        {
          id: 'system',
          label: $localize`:@@uiSettings-deviceSettings-colorSchemeSystem:System`,
          hint: $localize`:@@uiSettings-deviceSettings-colorSchemeSystemHint:wie das Gerät`,
        },
      ] satisfies Omit<ColorSchemeOption, 'checked'>[]
    ).map((option): ColorSchemeOption => ({
      ...option,
      checked: option.id === this.colorScheme(),
    })),
  );

  shortcuts: ShortcutEntry[] = [
    {
      key: $localize`:@@uiSettings-deviceSettings-spaceKey:Leertaste`,
      label: $localize`:@@uiSettings-deviceSettings-togglePause:Pause oder weiter`,
    },
    { key: '+', label: $localize`:@@uiSettings-deviceSettings-faster:schneller` },
    { key: '−', label: $localize`:@@uiSettings-deviceSettings-slower:langsamer` },
  ];

  onSelectColorScheme(colorScheme: ColorSchemeSetting): void {
    this.selectedColorScheme.emit(colorScheme);
  }

  onToggleShortcuts(event: Event): void {
    this.toggledShortcuts.emit((event.target as HTMLInputElement).checked);
  }
}
