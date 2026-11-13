import { createAction, props } from '@ngrx/store';

import { AccountId, DepotId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import {
  ProjectionPayload,
  TransferPayload,
} from '@app/engine/data-access/service/engine-service.model';
import { Bank } from '@app/world/domain/models/bank.model';

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
