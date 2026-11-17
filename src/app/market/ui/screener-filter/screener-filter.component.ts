import { Component, computed, input, output, signal } from '@angular/core';

import { regionLabels } from '@app/clock/ui/labels/region-labels';
import { INSTRUMENT_KINDS } from '@app/market/domain/models/instrument.model';
import { YieldRange } from '@app/market/domain/models/screener.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { InputDirective } from '@app/shared/ui/input/input.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { formatAmountInput, parseAmountInput } from '@app/shared/util/amount-input';
import {
  REGION_IDS,
  SECTOR_IDS,
  SIZE_CLASSES,
  STYLES,
} from '@app/world/domain/models/taxonomy.model';
import { COUNTRIES, INDUSTRIES } from '@app/world/domain/taxonomy';

import {
  ScreenerFilterGroup,
  ScreenerFilterOption,
  ScreenerFilterSelection,
} from './screener-filter.model';

import {
  countryLabel,
  industryLabel,
  instrumentKindLabel,
  sectorLabel,
  sizeLabel,
  styleLabel,
} from '../labels/taxonomy-labels';
import { ScreenerFilter, ScreenerFilterDimension } from '../models/screener-view.model';

/** A yield in percent with up to two decimal places is read as hundredths of a percent. */
const BASIS_POINTS = 10_000;

/** Longest search (TS §8.2, `MAX_SCREENER_SEARCH_LENGTH`). */
const MAX_SEARCH_LENGTH = 100;

type YieldBound = 'min' | 'max';

/**
 * Search and filters of the screener (US-MK-02, TS §5.3): several values per dimension (OR), the
 * dimensions combined (AND), the dividend yield as a range in percent. Countries follow the chosen
 * regions and industries the chosen sectors.
 */
@Component({
  selector: 'app-screener-filter',
  imports: [InputDirective, ButtonDirective, IconDirective, FormatNumberPipe],
  templateUrl: './screener-filter.component.html',
  host: { class: 'block' },
})
export class ScreenerFilterComponent {
  filter = input.required<ScreenerFilter>();
  total = input<number | null>(null);
  loading = input(false);
  filtered = input(false);

  maxSearchLength = MAX_SEARCH_LENGTH;

  enteredSearch = output<string>();
  selectedFilter = output<ScreenerFilterSelection>();
  submittedDividendYield = output<YieldRange>();
  clickedReset = output<void>();

  /** Bounds the user typed that are not a percentage. */
  invalidYield = signal<Readonly<Record<YieldBound, boolean>>>({ min: false, max: false });

  groups = computed((): ScreenerFilterGroup[] => {
    const filter = this.filter();
    const regions = filter.regions;
    const sectors = filter.sectors;
    return [
      this.#group('assetClasses', this.assetClassesLabel, filter, INSTRUMENT_KINDS, (kind) =>
        instrumentKindLabel(kind),
      ),
      this.#group('regions', this.regionsLabel, filter, REGION_IDS, (id) => regionLabels(id).label),
      this.#group(
        'countries',
        this.countriesLabel,
        filter,
        COUNTRIES.filter(
          (country) => regions.length === 0 || regions.includes(country.regionId),
        ).map((country) => country.id),
        countryLabel,
      ),
      this.#group('sectors', this.sectorsLabel, filter, SECTOR_IDS, sectorLabel),
      this.#group(
        'industries',
        this.industriesLabel,
        filter,
        INDUSTRIES.filter(
          (industry) => sectors.length === 0 || sectors.includes(industry.sectorId),
        ).map((industry) => industry.id),
        industryLabel,
      ),
      this.#group('sizes', this.sizesLabel, filter, SIZE_CLASSES, sizeLabel),
      this.#group('styles', this.stylesLabel, filter, STYLES, styleLabel),
    ];
  });
  yieldMin = computed(() => yieldText(this.filter().dividendYield.min));
  yieldMax = computed(() => yieldText(this.filter().dividendYield.max));

  searchLabel = $localize`:@@uiMarket-screenerFilter-search:Suche`;
  searchPlaceholder = $localize`:@@uiMarket-screenerFilter-searchPlaceholder:Name, Ticker oder Kennung`;
  assetClassesLabel = $localize`:@@uiMarket-screenerFilter-assetClasses:Assetklasse`;
  regionsLabel = $localize`:@@uiMarket-screenerFilter-regions:Region`;
  countriesLabel = $localize`:@@uiMarket-screenerFilter-countries:Land`;
  sectorsLabel = $localize`:@@uiMarket-screenerFilter-sectors:Sektor`;
  industriesLabel = $localize`:@@uiMarket-screenerFilter-industries:Branche`;
  sizesLabel = $localize`:@@uiMarket-screenerFilter-sizes:Größe`;
  stylesLabel = $localize`:@@uiMarket-screenerFilter-styles:Stil`;

  onSearch(event: Event): void {
    this.enteredSearch.emit((event.target as HTMLInputElement).value);
  }

  onToggle(group: ScreenerFilterGroup, option: ScreenerFilterOption, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const values = group.options
      .filter((other) => (other.id === option.id ? checked : other.selected))
      .map((other) => other.id);
    this.selectedFilter.emit({ dimension: group.dimension, values });
  }

  onClearGroup(dimension: ScreenerFilterDimension): void {
    this.selectedFilter.emit({ dimension, values: [] });
  }

  onYield(bound: YieldBound, event: Event): void {
    const result = parseAmountInput((event.target as HTMLInputElement).value);
    const invalid = result.kind === 'invalid' || (result.kind === 'amount' && result.cents < 0);
    this.invalidYield.update((current) => ({ ...current, [bound]: invalid }));
    if (invalid) {
      return;
    }
    const value = result.kind === 'amount' ? result.cents / BASIS_POINTS : undefined;
    const { min, max } = this.filter().dividendYield;
    const range: YieldRange = bound === 'min' ? { min: value, max } : { min, max: value };
    this.submittedDividendYield.emit(withoutUndefined(range));
  }

  onReset(): void {
    this.invalidYield.set({ min: false, max: false });
    this.clickedReset.emit();
  }

  #group<T extends string>(
    dimension: ScreenerFilterDimension,
    label: string,
    filter: ScreenerFilter,
    ids: readonly T[],
    optionLabel: (id: T) => string,
  ): ScreenerFilterGroup {
    const selected = filter[dimension] as readonly string[];
    const options = ids.map((id) => ({
      id,
      label: optionLabel(id),
      selected: selected.includes(id),
    }));
    return {
      dimension,
      label,
      options,
      selectedCount: options.filter((option) => option.selected).length,
    };
  }
}

function yieldText(ratio: number | undefined): string {
  return ratio === undefined ? '' : formatAmountInput(Math.round(ratio * BASIS_POINTS));
}

function withoutUndefined({ min, max }: YieldRange): YieldRange {
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}
