import { MAX_PURPOSE_LENGTH } from '@app/banking/domain/bank-command-logic';
import {
  BANK_COMMAND_ERRORS,
  BankCommandError,
} from '@app/banking/domain/models/bank-command.model';
import { EngineCommandError } from '@app/engine/data-access/service/engine.service';

import { BankCommand } from './banking.model';

/**
 * Text of a failed bank command (TS §8.6, AP 3.5 „Fehlercodes der Engine als verständliche
 * Texte“): the reason for the codes of the engine's bank rules and for a running jump or a failed
 * write, otherwise what could not be done.
 */
export function bankCommandFailureMessage(command: BankCommand, error: unknown): string {
  if (error instanceof EngineCommandError) {
    if (isBankCommandError(error.code)) {
      return bankCommandErrorMessage(error.code);
    }
    if (error.code === 'busy') {
      return $localize`:@@featureBanking-bankingErrors-busy:Das geht gerade nicht, weil die Spielzeit noch berechnet wird.`;
    }
    if (error.code === 'storage-failed') {
      return $localize`:@@featureBanking-bankingErrors-storageFailed:Der Auftrag konnte nicht gespeichert werden und wurde nicht ausgeführt.`;
    }
  }
  return bankCommandFallbackMessage(command);
}

function isBankCommandError(code: string): code is BankCommandError {
  return (BANK_COMMAND_ERRORS as readonly string[]).includes(code);
}

function bankCommandErrorMessage(code: BankCommandError): string {
  switch (code) {
    case 'unknown-bank':
      return $localize`:@@featureBanking-bankingErrors-unknownBank:Diese Bank gibt es nicht.`;
    case 'account-kind-not-offered':
      return $localize`:@@featureBanking-bankingErrors-accountKindNotOffered:Diese Bank bietet diese Kontoart nicht an.`;
    case 'unknown-account':
      return $localize`:@@featureBanking-bankingErrors-unknownAccount:Dieses Konto gibt es nicht.`;
    case 'account-closed':
      return $localize`:@@featureBanking-bankingErrors-accountClosed:Dieses Konto ist bereits geschlossen.`;
    case 'not-a-current-account':
      return $localize`:@@featureBanking-bankingErrors-notACurrentAccount:Nur ein Girokonto kann Gehaltskonto sein.`;
    case 'salary-account':
      return $localize`:@@featureBanking-bankingErrors-salaryAccount:Das Gehaltskonto lässt sich erst schließen, wenn du ein anderes Girokonto als Gehaltskonto gewählt hast.`;
    case 'negative-balance':
      return $localize`:@@featureBanking-bankingErrors-negativeBalance:Das Konto wäre nach dem Abschluss im Minus. Gleiche es zuerst mit einer Überweisung aus.`;
    case 'depot-not-empty':
      return $localize`:@@featureBanking-bankingErrors-depotNotEmpty:Im Depot liegen noch Wertpapiere, offene Orders oder Sparpläne.`;
    case 'target-required':
      return $localize`:@@featureBanking-bankingErrors-targetRequired:Wähle ein Konto, auf das das Restguthaben überwiesen wird.`;
    case 'invalid-target':
      return $localize`:@@featureBanking-bankingErrors-invalidTarget:Das Restguthaben kann nur auf ein anderes offenes Konto gehen.`;
    case 'same-account':
      return $localize`:@@featureBanking-bankingErrors-sameAccount:Absender- und Empfängerkonto müssen verschieden sein.`;
    case 'invalid-amount':
      return $localize`:@@featureBanking-bankingErrors-invalidAmount:Der Betrag muss mindestens 0,01 € sein.`;
    case 'insufficient-funds':
      return $localize`:@@featureBanking-bankingErrors-insufficientFunds:Der Betrag ist höher als das, was auf dem Konto verfügbar ist.`;
    case 'purpose-too-long':
      return $localize`:@@featureBanking-bankingErrors-purposeTooLong:Der Verwendungszweck darf höchstens ${MAX_PURPOSE_LENGTH}:maxLength: Zeichen lang sein.`;
  }
}

function bankCommandFallbackMessage(command: BankCommand): string {
  switch (command) {
    case 'openAccount':
      return $localize`:@@featureBanking-bankingErrors-openAccountFailure:Das Konto konnte nicht eröffnet werden.`;
    case 'closeAccount':
      return $localize`:@@featureBanking-bankingErrors-closeAccountFailure:Das Konto konnte nicht geschlossen werden.`;
    case 'setSalaryAccount':
      return $localize`:@@featureBanking-bankingErrors-setSalaryAccountFailure:Das Gehaltskonto konnte nicht gewechselt werden.`;
    case 'transfer':
      return $localize`:@@featureBanking-bankingErrors-transferFailure:Die Überweisung konnte nicht ausgeführt werden.`;
  }
}
