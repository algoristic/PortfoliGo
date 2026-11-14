import { GlossaryCategory, GlossaryTermId } from '@app/help/domain/models/glossary.model';

export interface GlossaryEntryView {
  id: GlossaryTermId;
  anchorId: string;
  term: string;
  short: string;
  details: string;
  related: { id: GlossaryTermId; term: string }[];
}

export interface GlossaryGroupView {
  category: GlossaryCategory;
  label: string;
  entries: GlossaryEntryView[];
}
