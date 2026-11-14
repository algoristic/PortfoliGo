import { Component, computed, input, output } from '@angular/core';

import { ChangeColorSetting, ColorSchemeSetting } from '@app/settings/domain/models/settings.model';

import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';

import { ChangeColorOption, ColorSchemeOption, ShortcutEntry } from './device-settings.model';

/**
 * Settings of this device (PS US-UI-09): appearance (US-UI-01), gain and loss colours (US-UI-02),
 * price highlight (US-MK-05) and shortcuts (US-ZT-02).
 */
@Component({
  selector: 'app-device-settings',
  imports: [PriceChangeComponent],
  templateUrl: './device-settings.component.html',
  host: { class: 'block' },
})
export class DeviceSettingsComponent {
  colorScheme = input<ColorSchemeSetting | null>();
  changeColors = input<ChangeColorSetting | null>();
  priceHighlight = input<boolean | null>();
  shortcutsEnabled = input<boolean | null>();

  /** Sample changes next to the colour choice: +1,23 % and −0,45 %. */
  sampleGain = 0.0123;
  sampleLoss = -0.0045;

  selectedColorScheme = output<ColorSchemeSetting>();
  selectedChangeColors = output<ChangeColorSetting>();
  toggledPriceHighlight = output<boolean>();
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

  changeColorOptions = computed(() =>
    (
      [
        {
          id: 'green-red',
          label: $localize`:@@uiSettings-deviceSettings-changeColorsGreenRed:Grün und Rot`,
          hint: $localize`:@@uiSettings-deviceSettings-changeColorsGreenRedHint:Standard`,
        },
        {
          id: 'blue-orange',
          label: $localize`:@@uiSettings-deviceSettings-changeColorsBlueOrange:Blau und Orange`,
          hint: $localize`:@@uiSettings-deviceSettings-changeColorsBlueOrangeHint:bei Rot-Grün-Sehschwäche`,
        },
      ] satisfies Omit<ChangeColorOption, 'checked'>[]
    ).map((option): ChangeColorOption => ({
      ...option,
      checked: option.id === this.changeColors(),
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

  onSelectChangeColors(changeColors: ChangeColorSetting): void {
    this.selectedChangeColors.emit(changeColors);
  }

  onTogglePriceHighlight(event: Event): void {
    this.toggledPriceHighlight.emit((event.target as HTMLInputElement).checked);
  }

  onToggleShortcuts(event: Event): void {
    this.toggledShortcuts.emit((event.target as HTMLInputElement).checked);
  }
}
