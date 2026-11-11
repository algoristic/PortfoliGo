import { SeriesKind } from '../../../market/domain/series';
import { SeriesOption } from '../../domain/models/world-overview.model';

export interface SeriesGroup {
  kind: SeriesKind;
  label: string;
  options: SeriesOption[];
}
