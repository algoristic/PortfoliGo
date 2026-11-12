import { PlayerListEntry } from '@app/players/domain/models/player.model';

export interface PlayerListRow extends PlayerListEntry {
  /** The player used last (TS §9.3); it is highlighted (PS US-SP-02). */
  isLast: boolean;
  /** Accessible names of the icon buttons, with the player's name. */
  renameLabel: string;
  deleteLabel: string;
  classes: string;
}
