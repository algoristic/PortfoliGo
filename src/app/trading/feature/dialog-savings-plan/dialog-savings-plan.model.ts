import { SavingsPlanChange, SavingsPlanSpec } from '@app/trading/domain/models/savings-plan.model';
import { SavingsPlanFormModel } from '@app/trading/ui/models/savings-plan.model';

export interface SavingsPlanDialogData {
  /** `create` for „Sparplan anlegen“, `change` for „Sparplan ändern“ (depot and instrument stay). */
  mode: 'create' | 'change';
  /** The preselected values: from the context when creating, the plan's values when changing. */
  initial: SavingsPlanFormModel;
}

/** The plan to create or the change; `undefined` when the dialog was closed without saving. */
export type SavingsPlanDialogResult = SavingsPlanSpec | SavingsPlanChange;
