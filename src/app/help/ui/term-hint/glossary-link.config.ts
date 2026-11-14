import { InjectionToken, Signal, signal } from '@angular/core';

/**
 * Router link of the glossary for the context help. The root default is the page without a game;
 * the shell provides `/game/:playerId/help`, so reading a term doesn't close the game.
 */
export const GLOSSARY_LINK = new InjectionToken<Signal<string>>('GLOSSARY_LINK', {
  providedIn: 'root',
  factory: () => signal('/help'),
});
