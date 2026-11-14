import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import { MAX_WATCHLIST_LENGTH } from '@app/market/domain/models/watchlist.model';

/**
 * Text of a failed watchlist change (TS §8.2, §8.6): the reason for the codes of the engine's
 * watchlist rules and for a running jump or a failed write, otherwise that the change was undone.
 */
export function watchlistFailureMessage(error: unknown): string {
  if (error instanceof EngineCommandError) {
    switch (error.code) {
      case 'unknown-instrument':
        return $localize`:@@featureMarket-watchlistErrors-unknownInstrument:Dieses Wertpapier gibt es nicht. Die Watchlist bleibt unverändert.`;
      case 'duplicate-instrument':
        return $localize`:@@featureMarket-watchlistErrors-duplicateInstrument:Dieses Wertpapier steht schon auf der Watchlist.`;
      case 'watchlist-too-long':
        return $localize`:@@featureMarket-watchlistErrors-watchlistTooLong:Die Watchlist ist voll. Sie fasst höchstens ${MAX_WATCHLIST_LENGTH}:maxLength: Wertpapiere.`;
      case 'busy':
        return $localize`:@@featureMarket-watchlistErrors-busy:Die Watchlist lässt sich gerade nicht ändern, weil die Spielzeit noch berechnet wird.`;
      case 'worker-restarted':
        return $localize`:@@featureMarket-watchlistErrors-workerRestarted:Die Spiel-Engine wurde neu gestartet. Die Änderung der Watchlist wurde zurückgenommen, bitte wiederhole sie.`;
      case 'storage-failed':
        return $localize`:@@featureMarket-watchlistErrors-storageFailed:Die Änderung der Watchlist konnte nicht gespeichert werden und wurde zurückgenommen.`;
    }
  }
  return $localize`:@@featureMarket-watchlistErrors-failure:Die Watchlist konnte nicht geändert werden. Die Änderung wurde zurückgenommen.`;
}
