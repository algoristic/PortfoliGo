import { Component, computed, input } from '@angular/core';

import { donutStrokes } from '@app/charts/util/donut-geometry';

import { DonutSegment } from './donut.model';

import { CHART_COLOR_STROKE_CLASSES } from '../models/chart-color.model';

/** Radius and width of the ring in the 100 × 100 view box. */
const RADIUS = 40;

/**
 * Donut as SVG (E-04): segments clockwise from the top in the given order, coloured with the
 * category tokens. The caller draws the legend (`CHART_COLOR_BACKGROUND_CLASSES`) and sizes the
 * host (e.g. `class="size-32"`); `label` names the chart for assistive technology.
 */
@Component({
  selector: 'app-donut',
  imports: [],
  templateUrl: './donut.component.html',
  host: { class: 'inline-block' },
})
export class DonutComponent {
  segments = input.required<readonly DonutSegment[]>();
  label = input.required<string>();
  /** Width of the ring in units of the 100 × 100 view box. */
  thickness = input(20);

  radius = RADIUS;

  strokes = computed(() => {
    const colors = new Map(this.segments().map((segment) => [segment.id, segment.color]));
    return donutStrokes(this.segments(), RADIUS).map((stroke) => ({
      ...stroke,
      strokeClass: CHART_COLOR_STROKE_CLASSES[colors.get(stroke.id) ?? 'chart-1'],
    }));
  });
}
