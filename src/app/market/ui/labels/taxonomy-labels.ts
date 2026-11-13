import { InstrumentKind } from '@app/market/domain/models/instrument.model';
import { SectorId, SizeClass, Style } from '@app/world/domain/models/taxonomy.model';

// Names of the codes the engine sends for the classification (TS §5.3, §8.6). Regions are named by
// `regionLabels` (`clock/ui/labels`). Industries and countries are data of the world (strings), so
// an unknown code shows as it is.

/** Asset classes of the screener (US-MK-02). */
export function instrumentKindLabel(kind: InstrumentKind): string {
  switch (kind) {
    case 'stock':
      return $localize`:@@uiMarket-taxonomyLabels-kindStock:Aktie`;
    case 'index':
      return $localize`:@@uiMarket-taxonomyLabels-kindIndex:Index`;
    case 'etf':
      return $localize`:@@uiMarket-taxonomyLabels-kindEtf:ETF`;
  }
}

export function sectorLabel(sectorId: SectorId): string {
  switch (sectorId) {
    case 'technology':
      return $localize`:@@uiMarket-taxonomyLabels-sectorTechnology:Technologie`;
    case 'health-care':
      return $localize`:@@uiMarket-taxonomyLabels-sectorHealthCare:Gesundheit`;
    case 'financials':
      return $localize`:@@uiMarket-taxonomyLabels-sectorFinancials:Finanzen`;
    case 'energy':
      return $localize`:@@uiMarket-taxonomyLabels-sectorEnergy:Energie`;
    case 'utilities':
      return $localize`:@@uiMarket-taxonomyLabels-sectorUtilities:Versorger`;
    case 'industrials':
      return $localize`:@@uiMarket-taxonomyLabels-sectorIndustrials:Industrie`;
    case 'materials':
      return $localize`:@@uiMarket-taxonomyLabels-sectorMaterials:Grundstoffe`;
    case 'consumer-discretionary':
      return $localize`:@@uiMarket-taxonomyLabels-sectorConsumerDiscretionary:Zyklischer Konsum`;
    case 'consumer-staples':
      return $localize`:@@uiMarket-taxonomyLabels-sectorConsumerStaples:Basiskonsum`;
    case 'communication-services':
      return $localize`:@@uiMarket-taxonomyLabels-sectorCommunicationServices:Kommunikation`;
    case 'real-estate':
      return $localize`:@@uiMarket-taxonomyLabels-sectorRealEstate:Immobilien`;
  }
}

export function industryLabel(industryId: string): string {
  switch (industryId) {
    case 'semiconductors':
      return $localize`:@@uiMarket-taxonomyLabels-industrySemiconductors:Halbleiter`;
    case 'software':
      return $localize`:@@uiMarket-taxonomyLabels-industrySoftware:Software`;
    case 'it-services':
      return $localize`:@@uiMarket-taxonomyLabels-industryItServices:IT-Dienstleistungen`;
    case 'hardware':
      return $localize`:@@uiMarket-taxonomyLabels-industryHardware:Hardware`;
    case 'pharma':
      return $localize`:@@uiMarket-taxonomyLabels-industryPharma:Pharma`;
    case 'biotech':
      return $localize`:@@uiMarket-taxonomyLabels-industryBiotech:Biotechnologie`;
    case 'medtech':
      return $localize`:@@uiMarket-taxonomyLabels-industryMedtech:Medizintechnik`;
    case 'banks':
      return $localize`:@@uiMarket-taxonomyLabels-industryBanks:Banken`;
    case 'insurance':
      return $localize`:@@uiMarket-taxonomyLabels-industryInsurance:Versicherungen`;
    case 'asset-management':
      return $localize`:@@uiMarket-taxonomyLabels-industryAssetManagement:Vermögensverwaltung`;
    case 'oil-gas':
      return $localize`:@@uiMarket-taxonomyLabels-industryOilGas:Öl und Gas`;
    case 'renewables':
      return $localize`:@@uiMarket-taxonomyLabels-industryRenewables:Erneuerbare Energien`;
    case 'power-utilities':
      return $localize`:@@uiMarket-taxonomyLabels-industryPowerUtilities:Stromversorger`;
    case 'gas-water-utilities':
      return $localize`:@@uiMarket-taxonomyLabels-industryGasWaterUtilities:Gas- und Wasserversorger`;
    case 'aerospace-defense':
      return $localize`:@@uiMarket-taxonomyLabels-industryAerospaceDefense:Luftfahrt und Verteidigung`;
    case 'machinery':
      return $localize`:@@uiMarket-taxonomyLabels-industryMachinery:Maschinenbau`;
    case 'logistics':
      return $localize`:@@uiMarket-taxonomyLabels-industryLogistics:Logistik`;
    case 'construction':
      return $localize`:@@uiMarket-taxonomyLabels-industryConstruction:Bau`;
    case 'chemicals':
      return $localize`:@@uiMarket-taxonomyLabels-industryChemicals:Chemie`;
    case 'metals-mining':
      return $localize`:@@uiMarket-taxonomyLabels-industryMetalsMining:Metalle und Bergbau`;
    case 'automotive':
      return $localize`:@@uiMarket-taxonomyLabels-industryAutomotive:Automobil`;
    case 'retail':
      return $localize`:@@uiMarket-taxonomyLabels-industryRetail:Einzelhandel`;
    case 'travel-leisure':
      return $localize`:@@uiMarket-taxonomyLabels-industryTravelLeisure:Reisen und Freizeit`;
    case 'luxury':
      return $localize`:@@uiMarket-taxonomyLabels-industryLuxury:Luxusgüter`;
    case 'food-beverages':
      return $localize`:@@uiMarket-taxonomyLabels-industryFoodBeverages:Nahrungsmittel und Getränke`;
    case 'household-products':
      return $localize`:@@uiMarket-taxonomyLabels-industryHouseholdProducts:Haushaltsprodukte`;
    case 'telecom':
      return $localize`:@@uiMarket-taxonomyLabels-industryTelecom:Telekommunikation`;
    case 'media-entertainment':
      return $localize`:@@uiMarket-taxonomyLabels-industryMediaEntertainment:Medien und Unterhaltung`;
    case 'internet-platforms':
      return $localize`:@@uiMarket-taxonomyLabels-industryInternetPlatforms:Internetplattformen`;
    case 'residential-real-estate':
      return $localize`:@@uiMarket-taxonomyLabels-industryResidentialRealEstate:Wohnimmobilien`;
    case 'commercial-real-estate':
      return $localize`:@@uiMarket-taxonomyLabels-industryCommercialRealEstate:Gewerbeimmobilien`;
    default:
      return industryId;
  }
}

/** Countries by ISO code. */
export function countryLabel(countryId: string): string {
  switch (countryId) {
    case 'US':
      return $localize`:@@uiMarket-taxonomyLabels-countryUs:USA`;
    case 'CA':
      return $localize`:@@uiMarket-taxonomyLabels-countryCa:Kanada`;
    case 'DE':
      return $localize`:@@uiMarket-taxonomyLabels-countryDe:Deutschland`;
    case 'FR':
      return $localize`:@@uiMarket-taxonomyLabels-countryFr:Frankreich`;
    case 'GB':
      return $localize`:@@uiMarket-taxonomyLabels-countryGb:Vereinigtes Königreich`;
    case 'CH':
      return $localize`:@@uiMarket-taxonomyLabels-countryCh:Schweiz`;
    case 'NL':
      return $localize`:@@uiMarket-taxonomyLabels-countryNl:Niederlande`;
    case 'JP':
      return $localize`:@@uiMarket-taxonomyLabels-countryJp:Japan`;
    case 'AU':
      return $localize`:@@uiMarket-taxonomyLabels-countryAu:Australien`;
    case 'HK':
      return $localize`:@@uiMarket-taxonomyLabels-countryHk:Hongkong`;
    case 'IN':
      return $localize`:@@uiMarket-taxonomyLabels-countryIn:Indien`;
    case 'BR':
      return $localize`:@@uiMarket-taxonomyLabels-countryBr:Brasilien`;
    default:
      return countryId;
  }
}

export function sizeLabel(size: SizeClass): string {
  switch (size) {
    case 'large':
      return $localize`:@@uiMarket-taxonomyLabels-sizeLarge:Large Cap`;
    case 'mid':
      return $localize`:@@uiMarket-taxonomyLabels-sizeMid:Mid Cap`;
    case 'small':
      return $localize`:@@uiMarket-taxonomyLabels-sizeSmall:Small Cap`;
  }
}

export function styleLabel(style: Style): string {
  switch (style) {
    case 'value':
      return $localize`:@@uiMarket-taxonomyLabels-styleValue:Value`;
    case 'blend':
      return $localize`:@@uiMarket-taxonomyLabels-styleBlend:Blend`;
    case 'growth':
      return $localize`:@@uiMarket-taxonomyLabels-styleGrowth:Growth`;
  }
}
