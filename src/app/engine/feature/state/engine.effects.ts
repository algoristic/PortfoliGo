import { inject, Injectable } from '@angular/core';
import { EngineService } from '../../data-access/service/engine.service';

@Injectable()
export class EngineEffects {
  private readonly service = inject(EngineService);
}
