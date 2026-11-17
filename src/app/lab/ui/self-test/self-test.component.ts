import { Component, computed, input, output } from '@angular/core';

import {
  GOLDEN_CHECKSUM_IDS,
  GOLDEN_CHECKSUMS,
  GOLDEN_SEED,
  GoldenChecksumId,
  GoldenChecksums,
  SELF_TEST_WORLD_SEEDS,
} from '@app/market/domain/golden-master';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';

import { SelfTestRow } from './self-test.model';

/**
 * Self-test of the determinism (TS §4.6, §14.2): golden-master checksums computed in this
 * browser's worker against the checked-in constants.
 */
@Component({
  selector: 'app-self-test',
  imports: [
    TableHeadDirective,
    TableCellDirective,
    TableDirective,
    BadgeComponent,
    ButtonDirective,
    FormatNumberPipe,
    SkeletonComponent,
  ],
  templateUrl: './self-test.component.html',
  host: { class: 'block' },
})
export class SelfTestComponent {
  /** Checksums of the last run, or `null` before the first run. */
  checksums = input<GoldenChecksums | null>(null);
  /** Duration of the last run in the worker. */
  durationMs = input<number>();
  running = input(false);

  goldenSeed = GOLDEN_SEED;

  clickedRun = output<void>();

  rows = computed<SelfTestRow[]>(() => {
    const checksums = this.checksums();
    return checksums === null
      ? []
      : GOLDEN_CHECKSUM_IDS.map((id) => ({
          id,
          label: this.labels[id],
          value: checksums[id],
          matches: checksums[id] === GOLDEN_CHECKSUMS[id],
        }));
  });
  mismatches = computed(() => this.rows().filter((row) => !row.matches).length);
  resultText = computed(() => {
    const total = this.rows().length;
    const count = this.mismatches();
    return count === 0
      ? $localize`:@@uiLab-selfTest-resultMatch:Alle ${total}:total: Prüfsummen stimmen.`
      : $localize`:@@uiLab-selfTest-resultMismatch:${count}:count: von ${total}:total: Prüfsummen weichen ab.`;
  });

  labels: Record<GoldenChecksumId, string> = {
    world: $localize`:@@uiLab-selfTest-world:Welt`,
    prices: $localize`:@@uiLab-selfTest-prices:Eröffnungs- und Schlusskurse 2020`,
    minutes: $localize`:@@uiLab-selfTest-minutes:Minutenkurse (Stichprobe 2020)`,
    indices: $localize`:@@uiLab-selfTest-indices:Indizes 2020`,
    etfs: $localize`:@@uiLab-selfTest-etfs:ETFs 2020`,
    gameStart: $localize`:@@uiLab-selfTest-gameStart:Marktzustand zum Spielstart`,
    worlds: $localize`:@@uiLab-selfTest-worlds:Welten von ${SELF_TEST_WORLD_SEEDS}:count: weiteren Seeds`,
  };
  matchLabel = $localize`:@@uiLab-selfTest-match:stimmt`;
  mismatchLabel = $localize`:@@uiLab-selfTest-mismatch:weicht ab`;

  onRun(): void {
    this.clickedRun.emit();
  }
}
