import { Injectable } from '@angular/core';

@Injectable()
export class EngineService {
  // nach initialisierung finden hier die internen berechnungen statt - nicht in den effects
  // die effects steuern weiterhin nur nutzerinteraktionen, wie bspw. das beschleunigen oder verlangesamen der ticks
  // das triggert wiederum änderungen hier in der eninge
  // - - - - -
  // die engine kann weiterhin auch selbst actions auslösen, indem sie observables bereitsstellt,
  // auf die sich die effects subscriben
  // - - - - -
  // treiber in der engine wird vermutlich eine rxjs logik sein
}
