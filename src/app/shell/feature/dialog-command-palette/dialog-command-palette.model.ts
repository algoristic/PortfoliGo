import { PaletteCommand } from '@app/shell/domain/models/command.model';

export const COMMAND_GROUPS = ['page', 'action', 'instrument'] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export interface CommandPaletteEntry {
  /** Unique within the palette; part of the option's ID and `data-testid`. */
  id: string;
  group: CommandGroup;
  label: string;
  /** Second line, e.g. ticker and kind of an instrument. */
  hint: string | null;
  icon: string;
  keywords: string[];
  command: PaletteCommand;
}

export interface CommandPaletteDialogData {
  /** Pages and actions, shown without a query. */
  commands: CommandPaletteEntry[];
  /** Instruments and their purchase, found only by a query. */
  instruments: CommandPaletteEntry[];
}

/** The chosen command; `undefined` when the palette was closed without one. */
export type CommandPaletteDialogResult = PaletteCommand;
