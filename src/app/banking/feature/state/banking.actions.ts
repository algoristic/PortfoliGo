import { createAction, props } from '@ngrx/store';

import { BankComparisonKey } from '@app/banking/domain/bank-comparison-logic';
import { AccountId, DepotId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { TransactionType } from '@app/banking/domain/models/ledger.model';
import {
  StandingOrderId,
  StandingOrderSpec,
} from '@app/banking/domain/models/standing-order.model';
import { StatementEntry, StatementPeriod } from '@app/banking/domain/models/statement.model';
import { Tick } from '@app/clock/domain/models/time.model';
import {
  MonthlyValuesResult,
  ProjectionPayload,
  TransferPayload,
} from '@app/engine/data-access/service/engine-service.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { StatementRange } from './banking.model';

/**
 * Opens the dialog „Konto eröffnen“, with the bank (bank comparison) or the kind (the order
 * ticket's hint „Kein Depot“) preselected when given.
 */
export const clickedOpenAccount = createAction(
  '[Banking/Page] Clicked open account',
  props<{ bankId?: string; kind?: OpenableAccountKind }>(),
);
/** Opens the transfer dialog, from `fromAccountId` when given. */
export const clickedTransfer = createAction(
  '[Banking/Page] Clicked transfer',
  props<{ fromAccountId?: AccountId }>(),
);
/** Loads the closing preview of the account and opens the dialog „Konto schließen“. */
export const clickedCloseAccount = createAction(
  '[Banking/Page] Clicked close account',
  props<{ accountId: AccountId }>(),
);
/** Opens the dialog „Gehaltskonto wechseln“, with the account preselected when given. */
export const clickedSalaryAccount = createAction(
  '[Banking/Page] Clicked salary account',
  props<{ accountId?: AccountId }>(),
);
/**
 * Opens the dialog „Dauerauftrag anlegen“ (US-BK-10), from `fromAccountId` when given, else from
 * the salary account.
 */
export const clickedCreateStandingOrder = createAction(
  '[Banking/Page] Clicked create standing order',
  props<{ fromAccountId?: AccountId }>(),
);
/** Opens the dialog „Dauerauftrag ändern“ with the values of the standing order. */
export const clickedChangeStandingOrder = createAction(
  '[Banking/Page] Clicked change standing order',
  props<{ standingOrderId: StandingOrderId }>(),
);
/** Asks for confirmation, then deletes the standing order. */
export const clickedDeleteStandingOrder = createAction(
  '[Banking/Page] Clicked delete standing order',
  props<{ standingOrderId: StandingOrderId }>(),
);
export const loadClosingPreviewFailure = createAction(
  '[Banking/API] Load closing preview failure',
  props<{ error: unknown }>(),
);
export const selectedBankSort = createAction(
  '[Banking/Page] Selected bank sort',
  props<{ key: BankComparisonKey }>(),
);

export const enterAccountsPage = createAction('[Banking/Page] Enter accounts page');
export const leaveAccountsPage = createAction('[Banking/Page] Leave accounts page');
export const retrievedMonthlyValues = createAction(
  '[Banking/API] Retrieved monthly values',
  props<{ monthlyValues: MonthlyValuesResult }>(),
);
export const loadMonthlyValuesFailure = createAction(
  '[Banking/API] Load monthly values failure',
  props<{ error: unknown }>(),
);

export const submittedOpenAccount = createAction(
  '[Banking/Page] Submitted open account',
  props<{ bankId: string; kind: OpenableAccountKind }>(),
);
/** `targetAccountId` receives the remainder after the closing settlement (TS §7.4). */
export const submittedCloseAccount = createAction(
  '[Banking/Page] Submitted close account',
  props<{ accountId: AccountId; targetAccountId?: AccountId }>(),
);
export const submittedSalaryAccount = createAction(
  '[Banking/Page] Submitted salary account',
  props<{ accountId: AccountId }>(),
);
export const submittedTransfer = createAction(
  '[Banking/Page] Submitted transfer',
  props<{ transfer: TransferPayload }>(),
);

export const submittedCreateStandingOrder = createAction(
  '[Banking/Page] Submitted create standing order',
  props<{ order: StandingOrderSpec }>(),
);
export const submittedChangeStandingOrder = createAction(
  '[Banking/Page] Submitted change standing order',
  props<{ standingOrderId: StandingOrderId; order: StandingOrderSpec }>(),
);
/** Pause (`paused: true`) or resume a standing order; no dialog. */
export const submittedStandingOrderPaused = createAction(
  '[Banking/Page] Submitted standing order paused',
  props<{ standingOrderId: StandingOrderId; paused: boolean }>(),
);
export const submittedDeleteStandingOrder = createAction(
  '[Banking/Page] Submitted delete standing order',
  props<{ standingOrderId: StandingOrderId }>(),
);

export const receivedProjection = createAction(
  '[Banking/API] Received projection',
  props<{ projection: ProjectionPayload }>(),
);
export const retrievedBanks = createAction(
  '[Banking/API] Retrieved banks',
  props<{ banks: Bank[] }>(),
);
export const loadBanksFailure = createAction(
  '[Banking/API] Load banks failure',
  props<{ error: unknown }>(),
);
/** The new account; for a depot, `accountId` is its clearing account. */
export const openAccountSuccess = createAction(
  '[Banking/API] Open account success',
  props<{
    bankId: string;
    kind: OpenableAccountKind;
    accountId: AccountId;
    depotId: DepotId | null;
    tick: Tick;
  }>(),
);
export const openAccountFailure = createAction(
  '[Banking/API] Open account failure',
  props<{ error: unknown }>(),
);
export const closeAccountSuccess = createAction(
  '[Banking/API] Close account success',
  props<{ accountId: AccountId; targetAccountId?: AccountId; tick: Tick }>(),
);
export const closeAccountFailure = createAction(
  '[Banking/API] Close account failure',
  props<{ error: unknown }>(),
);
export const setSalaryAccountSuccess = createAction(
  '[Banking/API] Set salary account success',
  props<{ accountId: AccountId; tick: Tick }>(),
);
export const setSalaryAccountFailure = createAction(
  '[Banking/API] Set salary account failure',
  props<{ error: unknown }>(),
);
export const transferSuccess = createAction(
  '[Banking/API] Transfer success',
  props<{ transfer: TransferPayload; tick: Tick }>(),
);
export const transferFailure = createAction(
  '[Banking/API] Transfer failure',
  props<{ error: unknown }>(),
);

export const createStandingOrderSuccess = createAction(
  '[Banking/API] Create standing order success',
  props<{ standingOrderId: StandingOrderId; tick: Tick }>(),
);
export const createStandingOrderFailure = createAction(
  '[Banking/API] Create standing order failure',
  props<{ error: unknown }>(),
);
export const changeStandingOrderSuccess = createAction(
  '[Banking/API] Change standing order success',
  props<{ standingOrderId: StandingOrderId; tick: Tick }>(),
);
export const changeStandingOrderFailure = createAction(
  '[Banking/API] Change standing order failure',
  props<{ error: unknown }>(),
);
export const setStandingOrderPausedSuccess = createAction(
  '[Banking/API] Set standing order paused success',
  props<{ standingOrderId: StandingOrderId; paused: boolean; tick: Tick }>(),
);
export const setStandingOrderPausedFailure = createAction(
  '[Banking/API] Set standing order paused failure',
  props<{ error: unknown }>(),
);
export const deleteStandingOrderSuccess = createAction(
  '[Banking/API] Delete standing order success',
  props<{ standingOrderId: StandingOrderId; tick: Tick }>(),
);
export const deleteStandingOrderFailure = createAction(
  '[Banking/API] Delete standing order failure',
  props<{ error: unknown }>(),
);

export const enterAccountStatementPage = createAction(
  '[Banking/Page] Enter account statement page',
);
export const leaveAccountStatementPage = createAction(
  '[Banking/Page] Leave account statement page',
);
export const selectedStatementPeriod = createAction(
  '[Banking/Page] Selected statement period',
  props<{ period: StatementPeriod }>(),
);
/** No types: all types. */
export const selectedStatementTypes = createAction(
  '[Banking/Page] Selected statement types',
  props<{ types: TransactionType[] }>(),
);
export const enteredStatementSearch = createAction(
  '[Banking/Page] Entered statement search',
  props<{ search: string }>(),
);
export const clickedResetStatementFilter = createAction(
  '[Banking/Page] Clicked reset statement filter',
);
export const scrolledStatement = createAction(
  '[Banking/Page] Scrolled statement',
  props<{ range: StatementRange }>(),
);
/** A window of the statement of query `generation`: rows `offset` to `offset + entries.length`. */
export const retrievedStatementPage = createAction(
  '[Banking/API] Retrieved statement page',
  props<{ generation: number; offset: number; total: number; entries: StatementEntry[] }>(),
);
export const loadStatementFailure = createAction(
  '[Banking/API] Load statement failure',
  props<{ generation: number; error: unknown }>(),
);
