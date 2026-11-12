import { Cents } from '@app/shared/domain/models/money.model';

/** Values of the form „Spieler anlegen“ (PS US-SP-01); an empty amount field is `null`. */
export interface NewPlayerFormModel {
  name: string;
  seed: string;
  startCapital: Cents | null;
  netIncome: Cents | null;
  livingCosts: Cents | null;
}
