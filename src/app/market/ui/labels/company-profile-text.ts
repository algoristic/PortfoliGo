import { CompanyProfile } from '@app/world/domain/models/company.model';

import { countryLabel, industryLabel } from './taxonomy-labels';

// Short profiles of companies (TS §5.4, §8.6): the engine sends a template code and the focus code
// of the industry, the text is built here. Focus codes are data of the world (strings), so an
// unknown code shows as it is.

/** What the profile text needs from the master data besides the template code. */
export interface CompanyProfileFacts {
  profile: CompanyProfile;
  industryId: string;
  countryId: string;
  foundedYear: number;
}

/** Name of a focus code of an industry (`INDUSTRIES[].focusCodes`). */
export function focusLabel(focus: string): string {
  switch (focus) {
    case 'memory-chips':
      return $localize`:@@uiMarket-companyProfileText-focusMemoryChips:Speicherchips`;
    case 'processors':
      return $localize`:@@uiMarket-companyProfileText-focusProcessors:Prozessoren`;
    case 'sensors':
      return $localize`:@@uiMarket-companyProfileText-focusSensors:Sensoren`;
    case 'power-electronics':
      return $localize`:@@uiMarket-companyProfileText-focusPowerElectronics:Leistungselektronik`;
    case 'enterprise-software':
      return $localize`:@@uiMarket-companyProfileText-focusEnterpriseSoftware:Unternehmenssoftware`;
    case 'security-software':
      return $localize`:@@uiMarket-companyProfileText-focusSecuritySoftware:Sicherheitssoftware`;
    case 'cloud-platforms':
      return $localize`:@@uiMarket-companyProfileText-focusCloudPlatforms:Cloud-Plattformen`;
    case 'design-software':
      return $localize`:@@uiMarket-companyProfileText-focusDesignSoftware:Konstruktionssoftware`;
    case 'it-consulting':
      return $localize`:@@uiMarket-companyProfileText-focusItConsulting:IT-Beratung`;
    case 'outsourcing':
      return $localize`:@@uiMarket-companyProfileText-focusOutsourcing:IT-Outsourcing`;
    case 'data-centers':
      return $localize`:@@uiMarket-companyProfileText-focusDataCenters:Rechenzentren`;
    case 'consumer-electronics':
      return $localize`:@@uiMarket-companyProfileText-focusConsumerElectronics:Unterhaltungselektronik`;
    case 'network-equipment':
      return $localize`:@@uiMarket-companyProfileText-focusNetworkEquipment:Netzwerktechnik`;
    case 'storage-systems':
      return $localize`:@@uiMarket-companyProfileText-focusStorageSystems:Speichersysteme`;
    case 'oncology':
      return $localize`:@@uiMarket-companyProfileText-focusOncology:Onkologie`;
    case 'vaccines':
      return $localize`:@@uiMarket-companyProfileText-focusVaccines:Impfstoffe`;
    case 'generics':
      return $localize`:@@uiMarket-companyProfileText-focusGenerics:Generika`;
    case 'cardiology':
      return $localize`:@@uiMarket-companyProfileText-focusCardiology:Kardiologie`;
    case 'gene-therapy':
      return $localize`:@@uiMarket-companyProfileText-focusGeneTherapy:Gentherapie`;
    case 'antibodies':
      return $localize`:@@uiMarket-companyProfileText-focusAntibodies:Antikörper`;
    case 'rare-diseases':
      return $localize`:@@uiMarket-companyProfileText-focusRareDiseases:Seltene Erkrankungen`;
    case 'implants':
      return $localize`:@@uiMarket-companyProfileText-focusImplants:Implantate`;
    case 'diagnostics':
      return $localize`:@@uiMarket-companyProfileText-focusDiagnostics:Diagnostik`;
    case 'imaging':
      return $localize`:@@uiMarket-companyProfileText-focusImaging:Bildgebung`;
    case 'surgical-robots':
      return $localize`:@@uiMarket-companyProfileText-focusSurgicalRobots:Operationsroboter`;
    case 'retail-banking':
      return $localize`:@@uiMarket-companyProfileText-focusRetailBanking:Privatkundengeschäft`;
    case 'investment-banking':
      return $localize`:@@uiMarket-companyProfileText-focusInvestmentBanking:Investmentbanking`;
    case 'mortgages':
      return $localize`:@@uiMarket-companyProfileText-focusMortgages:Baufinanzierung`;
    case 'life-insurance':
      return $localize`:@@uiMarket-companyProfileText-focusLifeInsurance:Lebensversicherung`;
    case 'property-insurance':
      return $localize`:@@uiMarket-companyProfileText-focusPropertyInsurance:Sachversicherung`;
    case 'reinsurance':
      return $localize`:@@uiMarket-companyProfileText-focusReinsurance:Rückversicherung`;
    case 'fund-management':
      return $localize`:@@uiMarket-companyProfileText-focusFundManagement:Fondsverwaltung`;
    case 'private-equity':
      return $localize`:@@uiMarket-companyProfileText-focusPrivateEquity:Private Equity`;
    case 'wealth-management':
      return $localize`:@@uiMarket-companyProfileText-focusWealthManagement:Vermögensberatung`;
    case 'exploration':
      return $localize`:@@uiMarket-companyProfileText-focusExploration:Exploration und Förderung`;
    case 'refining':
      return $localize`:@@uiMarket-companyProfileText-focusRefining:Raffinerie`;
    case 'pipelines':
      return $localize`:@@uiMarket-companyProfileText-focusPipelines:Pipelines`;
    case 'solar-parks':
      return $localize`:@@uiMarket-companyProfileText-focusSolarParks:Solarparks`;
    case 'wind-turbines':
      return $localize`:@@uiMarket-companyProfileText-focusWindTurbines:Windkraftanlagen`;
    case 'hydrogen':
      return $localize`:@@uiMarket-companyProfileText-focusHydrogen:Wasserstoff`;
    case 'energy-storage':
      return $localize`:@@uiMarket-companyProfileText-focusEnergyStorage:Energiespeicher`;
    case 'power-generation':
      return $localize`:@@uiMarket-companyProfileText-focusPowerGeneration:Stromerzeugung`;
    case 'power-grids':
      return $localize`:@@uiMarket-companyProfileText-focusPowerGrids:Stromnetze`;
    case 'district-heating':
      return $localize`:@@uiMarket-companyProfileText-focusDistrictHeating:Fernwärme`;
    case 'water-supply':
      return $localize`:@@uiMarket-companyProfileText-focusWaterSupply:Wasserversorgung`;
    case 'gas-networks':
      return $localize`:@@uiMarket-companyProfileText-focusGasNetworks:Gasnetze`;
    case 'waste-management':
      return $localize`:@@uiMarket-companyProfileText-focusWasteManagement:Entsorgung`;
    case 'aircraft-parts':
      return $localize`:@@uiMarket-companyProfileText-focusAircraftParts:Flugzeugteile`;
    case 'satellites':
      return $localize`:@@uiMarket-companyProfileText-focusSatellites:Satelliten`;
    case 'defence-systems':
      return $localize`:@@uiMarket-companyProfileText-focusDefenceSystems:Verteidigungssysteme`;
    case 'automation':
      return $localize`:@@uiMarket-companyProfileText-focusAutomation:Automatisierung`;
    case 'industrial-pumps':
      return $localize`:@@uiMarket-companyProfileText-focusIndustrialPumps:Industriepumpen`;
    case 'machine-tools':
      return $localize`:@@uiMarket-companyProfileText-focusMachineTools:Werkzeugmaschinen`;
    case 'robotics':
      return $localize`:@@uiMarket-companyProfileText-focusRobotics:Robotik`;
    case 'parcel-delivery':
      return $localize`:@@uiMarket-companyProfileText-focusParcelDelivery:Paketdienste`;
    case 'container-shipping':
      return $localize`:@@uiMarket-companyProfileText-focusContainerShipping:Containerschifffahrt`;
    case 'rail-freight':
      return $localize`:@@uiMarket-companyProfileText-focusRailFreight:Schienengüterverkehr`;
    case 'infrastructure':
      return $localize`:@@uiMarket-companyProfileText-focusInfrastructure:Infrastrukturbau`;
    case 'building-materials':
      return $localize`:@@uiMarket-companyProfileText-focusBuildingMaterials:Baustoffe`;
    case 'civil-engineering':
      return $localize`:@@uiMarket-companyProfileText-focusCivilEngineering:Tiefbau`;
    case 'specialty-chemicals':
      return $localize`:@@uiMarket-companyProfileText-focusSpecialtyChemicals:Spezialchemie`;
    case 'plastics':
      return $localize`:@@uiMarket-companyProfileText-focusPlastics:Kunststoffe`;
    case 'fertilisers':
      return $localize`:@@uiMarket-companyProfileText-focusFertilisers:Düngemittel`;
    case 'copper':
      return $localize`:@@uiMarket-companyProfileText-focusCopper:Kupfer`;
    case 'iron-ore':
      return $localize`:@@uiMarket-companyProfileText-focusIronOre:Eisenerz`;
    case 'steel':
      return $localize`:@@uiMarket-companyProfileText-focusSteel:Stahl`;
    case 'lithium':
      return $localize`:@@uiMarket-companyProfileText-focusLithium:Lithium`;
    case 'cars':
      return $localize`:@@uiMarket-companyProfileText-focusCars:Personenwagen`;
    case 'electric-vehicles':
      return $localize`:@@uiMarket-companyProfileText-focusElectricVehicles:Elektrofahrzeuge`;
    case 'auto-parts':
      return $localize`:@@uiMarket-companyProfileText-focusAutoParts:Autozulieferteile`;
    case 'trucks':
      return $localize`:@@uiMarket-companyProfileText-focusTrucks:Nutzfahrzeuge`;
    case 'department-stores':
      return $localize`:@@uiMarket-companyProfileText-focusDepartmentStores:Warenhäuser`;
    case 'online-retail':
      return $localize`:@@uiMarket-companyProfileText-focusOnlineRetail:Onlinehandel`;
    case 'fashion-retail':
      return $localize`:@@uiMarket-companyProfileText-focusFashionRetail:Modehandel`;
    case 'airlines':
      return $localize`:@@uiMarket-companyProfileText-focusAirlines:Luftverkehr`;
    case 'hotels':
      return $localize`:@@uiMarket-companyProfileText-focusHotels:Hotellerie`;
    case 'cruises':
      return $localize`:@@uiMarket-companyProfileText-focusCruises:Kreuzfahrten`;
    case 'theme-parks':
      return $localize`:@@uiMarket-companyProfileText-focusThemeParks:Freizeitparks`;
    case 'jewellery':
      return $localize`:@@uiMarket-companyProfileText-focusJewellery:Schmuck`;
    case 'fashion':
      return $localize`:@@uiMarket-companyProfileText-focusFashion:Mode`;
    case 'watches':
      return $localize`:@@uiMarket-companyProfileText-focusWatches:Uhren`;
    case 'packaged-food':
      return $localize`:@@uiMarket-companyProfileText-focusPackagedFood:Markenlebensmittel`;
    case 'beer':
      return $localize`:@@uiMarket-companyProfileText-focusBeer:Bier`;
    case 'soft-drinks':
      return $localize`:@@uiMarket-companyProfileText-focusSoftDrinks:Erfrischungsgetränke`;
    case 'dairy':
      return $localize`:@@uiMarket-companyProfileText-focusDairy:Molkereiprodukte`;
    case 'detergents':
      return $localize`:@@uiMarket-companyProfileText-focusDetergents:Waschmittel`;
    case 'cosmetics':
      return $localize`:@@uiMarket-companyProfileText-focusCosmetics:Kosmetik`;
    case 'personal-care':
      return $localize`:@@uiMarket-companyProfileText-focusPersonalCare:Körperpflege`;
    case 'mobile-networks':
      return $localize`:@@uiMarket-companyProfileText-focusMobileNetworks:Mobilfunk`;
    case 'fibre-networks':
      return $localize`:@@uiMarket-companyProfileText-focusFibreNetworks:Glasfasernetze`;
    case 'satellite-communication':
      return $localize`:@@uiMarket-companyProfileText-focusSatelliteCommunication:Satellitenkommunikation`;
    case 'streaming':
      return $localize`:@@uiMarket-companyProfileText-focusStreaming:Streaming`;
    case 'video-games':
      return $localize`:@@uiMarket-companyProfileText-focusVideoGames:Videospiele`;
    case 'publishing':
      return $localize`:@@uiMarket-companyProfileText-focusPublishing:Verlagswesen`;
    case 'broadcasting':
      return $localize`:@@uiMarket-companyProfileText-focusBroadcasting:Rundfunk`;
    case 'search':
      return $localize`:@@uiMarket-companyProfileText-focusSearch:Suchmaschinen`;
    case 'social-networks':
      return $localize`:@@uiMarket-companyProfileText-focusSocialNetworks:Soziale Netzwerke`;
    case 'marketplaces':
      return $localize`:@@uiMarket-companyProfileText-focusMarketplaces:Online-Marktplätze`;
    case 'online-advertising':
      return $localize`:@@uiMarket-companyProfileText-focusOnlineAdvertising:Onlinewerbung`;
    case 'apartments':
      return $localize`:@@uiMarket-companyProfileText-focusApartments:Mietwohnungen`;
    case 'student-housing':
      return $localize`:@@uiMarket-companyProfileText-focusStudentHousing:Studentenwohnheime`;
    case 'senior-living':
      return $localize`:@@uiMarket-companyProfileText-focusSeniorLiving:Seniorenwohnen`;
    case 'office-buildings':
      return $localize`:@@uiMarket-companyProfileText-focusOfficeBuildings:Büroimmobilien`;
    case 'shopping-centres':
      return $localize`:@@uiMarket-companyProfileText-focusShoppingCentres:Einkaufszentren`;
    case 'warehouses':
      return $localize`:@@uiMarket-companyProfileText-focusWarehouses:Logistikimmobilien`;
    default:
      return focus;
  }
}

/** The short profile of a company from its template code with focus, industry, country and year. */
export function companyProfileText(facts: CompanyProfileFacts): string {
  const focus = focusLabel(facts.profile.focus);
  const industry = industryLabel(facts.industryId);
  const country = countryLabel(facts.countryId);
  const year = String(facts.foundedYear);
  switch (facts.profile.template) {
    case 'market-leader':
      return $localize`:@@uiMarket-companyProfileText-marketLeader:Marktführer im Bereich ${focus}:focus: und einer der größten Anbieter der Branche ${industry}:industry:. Gegründet ${year}:year:, Heimatmarkt: ${country}:country:.`;
    case 'challenger':
      return $localize`:@@uiMarket-companyProfileText-challenger:Herausforderer im Bereich ${focus}:focus:, der den etablierten Anbietern der Branche ${industry}:industry: Marktanteile abnimmt. Gegründet ${year}:year:, Heimatmarkt: ${country}:country:.`;
    case 'specialist':
      return $localize`:@@uiMarket-companyProfileText-specialist:Spezialist im Bereich ${focus}:focus: mit einer klaren Nische in der Branche ${industry}:industry:. Gegründet ${year}:year:, Heimatmarkt: ${country}:country:.`;
    case 'family-owned':
      return $localize`:@@uiMarket-companyProfileText-familyOwned:Familiengeführtes Unternehmen im Bereich ${focus}:focus: aus der Branche ${industry}:industry:; die Gründerfamilie prägt die Strategie bis heute. Gegründet ${year}:year:, Heimatmarkt: ${country}:country:.`;
  }
}
