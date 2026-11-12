import { Component, computed, input } from '@angular/core';

/** Loading placeholder: `lines` text lines or, with `block`, one block that fills the host. */
@Component({
  selector: 'app-skeleton',
  imports: [],
  templateUrl: './skeleton.component.html',
  host: { class: 'block' },
})
export class SkeletonComponent {
  lines = input(1);
  block = input(false);

  lineIndexes = computed(() => Array.from({ length: this.lines() }, (_, i) => i));
}
