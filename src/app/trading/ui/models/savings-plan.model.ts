import { DepotId } from '@app/banking/domain/models/account.model';
import { FeeModel } from '@app/banking/domain/models/bank-conditions.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { InstrumentKind } from '@app/market/domain/models/instrument.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { SavingsPlanId, SavingsPlanView } from '@app/trading/domain/models/savings-plan.model';
import { ExchangeQuote } from '@app/trading/domain/order-preview-logic';

/** A savings plan with the names it is shown with (US-HD-05). */
export interface SavingsPlanEntry {
  plan: SavingsPlanView;
  /** The instrument's name; its ID while the master data is missing. */
  instrumentName: string;
  depotNumber: string;
  /** `null` while the banks are not loaded or the depot is unknown. */
  bankName: string | null;
}

/** Pause (`paused: true`) or resume the savings plan. */
export interface SavingsPlanPauseChange {
  id: SavingsPlanId;
  paused: boolean;
}

/** A row of the savings plan list with its texts. */
export interface SavingsPlanRow {
  id: SavingsPlanId;
  instrumentId: string;
  instrumentName: string;
  depotLabel: string;
  amount: Cents;
  day: number;
  paused: boolean;
  nextExecution: Tick | null;
  /** Names the plan for the actions' `aria-label`, e.g. „Sparplan Weltindex ETF, 50,00 €“. */
  name: string;
}

/** An open depot the savings plan dialog offers, with what the preview needs (TS §11.8). */
export interface SavingsPlanDepot {
  depotId: DepotId;
  number: string;
  bankName: string;
  savingsPlanFee: FeeModel;
  spreadMarkup: number;
  clearingBalance: Cents;
  /** Reservations of the depot's active buy orders. */
  reserved: Cents;
}

/** A savings-plan-eligible instrument the dialog offers. */
export interface SavingsPlanInstrument {
  id: string;
  name: string;
  kind: InstrumentKind;
}

/**
 * Live state of the savings plan dialog (US-HD-05): the open depots, the eligible instruments and
 * the last quote of the chosen instrument (without a venue mark-up; `null` until it arrives).
 */
export interface SavingsPlanDialogContext {
  depots: SavingsPlanDepot[];
  instruments: SavingsPlanInstrument[];
  quote: ExchangeQuote | null;
}

/** Values of the controls of the savings plan form; selects hold `''` for none. */
export interface SavingsPlanFormModel {
  depotId: string;
  instrumentId: string;
  amount: Cents | null;
  day: string;
}
