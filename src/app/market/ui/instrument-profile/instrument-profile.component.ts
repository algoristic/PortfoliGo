import { Component, computed, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { FormatCompactEurosPipe } from '@app/shared/ui/pipes/format-compact-euros/format-compact-euros.pipe';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { MISSING_VALUE } from '@app/shared/util/format';

import { companyProfileText } from '../labels/company-profile-text';
import {
  etfDistributionLabel,
  etfReplicationLabel,
  indexVariantLabel,
  riskClassLabel,
} from '../labels/instrument-labels';
import {
  countryLabel,
  industryLabel,
  sectorLabel,
  sizeLabel,
  styleLabel,
} from '../labels/taxonomy-labels';
import { InstrumentProfileView } from '../models/instrument-view.model';

/** A row of the facts list: label, text and the `data-testid` suffix. */
interface ProfileFact {
  key: string;
  label: string;
  text: string;
}

/**
 * Profile of the instrument page (US-MK-03): for shares the classification, founding year,
 * employees, free float, the short description from the template code (TS §5.4, §8.6) and the
 * indices the share belongs to; for ETFs the tracked index, TER, use of income, replication,
 * issuer and fund volume; for indices the kind, the number of constituents and the capping.
 * Numbers are formatted in the template; the facts here are texts only.
 */
@Component({
  selector: 'app-instrument-profile',
  imports: [RouterModule, FormatCompactEurosPipe, FormatNumberPipe, FormatPercentPipe],
  templateUrl: './instrument-profile.component.html',
  host: { class: 'block' },
})
export class InstrumentProfileComponent {
  profile = input.required<InstrumentProfileView>();

  description = computed(() => {
    const profile = this.profile();
    return profile.kind === 'stock' && profile.industryId !== null && profile.countryId !== null
      ? companyProfileText({
          profile: profile.profile,
          industryId: profile.industryId,
          countryId: profile.countryId,
          foundedYear: profile.foundedYear,
        })
      : null;
  });
  facts = computed((): ProfileFact[] => {
    const profile = this.profile();
    switch (profile.kind) {
      case 'stock':
        return [
          {
            key: 'sector',
            label: this.sectorLabel,
            text: profile.sectorId === null ? MISSING_VALUE : sectorLabel(profile.sectorId),
          },
          {
            key: 'industry',
            label: this.industryLabel,
            text: profile.industryId === null ? MISSING_VALUE : industryLabel(profile.industryId),
          },
          {
            key: 'country',
            label: this.countryLabel,
            text: profile.countryId === null ? MISSING_VALUE : countryLabel(profile.countryId),
          },
          {
            key: 'size',
            label: this.sizeLabel,
            text: profile.size === null ? MISSING_VALUE : sizeLabel(profile.size),
          },
          {
            key: 'style',
            label: this.styleLabel,
            text: profile.style === null ? MISSING_VALUE : styleLabel(profile.style),
          },
          {
            key: 'risk-class',
            label: this.riskClassLabel,
            text: profile.riskClass === null ? MISSING_VALUE : riskClassLabel(profile.riskClass),
          },
          { key: 'founded', label: this.foundedLabel, text: String(profile.foundedYear) },
        ];
      case 'etf':
        return [
          {
            key: 'distribution',
            label: this.distributionLabel,
            text: etfDistributionLabel(profile.distribution, profile.distributionFrequency),
          },
          {
            key: 'replication',
            label: this.replicationLabel,
            text: etfReplicationLabel(profile.replication),
          },
          { key: 'issuer', label: this.issuerLabel, text: profile.issuerName },
        ];
      case 'index':
        return [
          { key: 'variant', label: this.variantLabel, text: indexVariantLabel(profile.variant) },
        ];
    }
  });

  siblingLabel = computed(() => {
    const profile = this.profile();
    return profile.kind === 'index'
      ? indexVariantLabel(profile.variant === 'price' ? 'total-return' : 'price')
      : null;
  });

  sectorLabel = $localize`:@@uiMarket-instrumentProfile-sector:Sektor`;
  industryLabel = $localize`:@@uiMarket-instrumentProfile-industry:Branche`;
  countryLabel = $localize`:@@uiMarket-instrumentProfile-country:Land`;
  sizeLabel = $localize`:@@uiMarket-instrumentProfile-size:Größe`;
  styleLabel = $localize`:@@uiMarket-instrumentProfile-style:Stil`;
  riskClassLabel = $localize`:@@uiMarket-instrumentProfile-riskClass:Risikoklasse`;
  foundedLabel = $localize`:@@uiMarket-instrumentProfile-founded:Gegründet`;
  distributionLabel = $localize`:@@uiMarket-instrumentProfile-distribution:Ertragsverwendung`;
  replicationLabel = $localize`:@@uiMarket-instrumentProfile-replication:Replikation`;
  issuerLabel = $localize`:@@uiMarket-instrumentProfile-issuer:Emittent`;
  variantLabel = $localize`:@@uiMarket-instrumentProfile-variant:Art`;
}
