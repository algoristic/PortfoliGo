import { Component, computed, input, output } from '@angular/core';

import { ChangeColorSetting, ColorSchemeSetting } from '@app/settings/domain/models/settings.model';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { Language } from '@app/shared/util/locale';

import {
  ChangeColorOption,
  ColorSchemeOption,
  LanguageOption,
  ShortcutEntry,
} from './device-settings.model';

/** Names of the languages in their own language (PS US-UI-11). */
const LANGUAGE_NAMES: Record<Language, string> = { de: 'Deutsch', en: 'English' };

/**
 * Settings of this device (PS US-UI-09): language (US-UI-11), appearance (US-UI-01), gain and loss colours (US-UI-02),
 * price highlight (US-MK-05) and shortcuts (US-ZT-02).
 */
@Component({
  selector: 'app-device-settings',
  imports: [PriceChangeComponent],
  templateUrl: './device-settings.component.html',
  host: { class: 'block' },
})
export class DeviceSettingsComponent {
  language = input<Language | null>();
  colorScheme = input<ColorSchemeSetting | null>();
  changeColors = input<ChangeColorSetting | null>();
  priceHighlight = input<boolean | null>();
  shortcutsEnabled = input<boolean | null>();

  /** Sample changes next to the colour choice: +1,23 % and −0,45 %. */
  sampleGain = 0.0123;
  sampleLoss = -0.0045;

  selectedLanguage = output<Language>();
  selectedColorScheme = output<ColorSchemeSetting>();
  selectedChangeColors = output<ChangeColorSetting>();
  toggledPriceHighlight = output<boolean>();
  toggledShortcuts = output<boolean>();

  languageOptions = computed(() =>
    (Object.keys(LANGUAGE_NAMES) as Language[]).map((id): LanguageOption => ({
      id,
      label: LANGUAGE_NAMES[id],
      checked: id === this.language(),
    })),
  );

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
    {
      key: $localize`:@@uiSettings-deviceSettings-paletteKey:Strg/⌘ + K`,
      label: $localize`:@@uiSettings-deviceSettings-commandPalette:Befehlspalette öffnen`,
    },
  ];

  onSelectLanguage(language: Language): void {
    this.selectedLanguage.emit(language);
  }

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
