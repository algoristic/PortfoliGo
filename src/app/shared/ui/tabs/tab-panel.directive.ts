import { Directive, inject, input, TemplateRef } from '@angular/core';

/** Content of one tab: `<ng-template appTabPanel="overview">…</ng-template>` inside `app-tabs`. */
@Directive({ selector: 'ng-template[appTabPanel]' })
export class TabPanelDirective {
  template = inject<TemplateRef<unknown>>(TemplateRef);

  tabId = input.required<string>({ alias: 'appTabPanel' });
}
