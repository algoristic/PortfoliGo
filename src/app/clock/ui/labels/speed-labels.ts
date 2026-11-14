import { SpeedId } from '@app/clock/domain/models/speed.model';

// Names of the speed levels (TS §3.4), shared by the clock bar and the player settings. The IDs keep
// the names of the clock bar, where they began.

export function speedLabel(id: SpeedId): string {
  switch (id) {
    case 'realtime':
      return $localize`:@@uiClock-clockControls-speedRealtime:Echtzeit`;
    case '1min':
      return $localize`:@@uiClock-clockControls-speed1min:1 min/s`;
    case '10min':
      return $localize`:@@uiClock-clockControls-speed10min:10 min/s`;
    case '1h':
      return $localize`:@@uiClock-clockControls-speed1h:1 h/s`;
    case '2h':
      return $localize`:@@uiClock-clockControls-speed2h:2 h/s`;
    case '4h':
      return $localize`:@@uiClock-clockControls-speed4h:4 h/s`;
    case '1d':
      return $localize`:@@uiClock-clockControls-speed1d:1 d/s`;
    case '1w':
      return $localize`:@@uiClock-clockControls-speed1w:1 w/s`;
  }
}
