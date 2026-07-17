export type FieldKind = 'single' | 'list' | 'table';

export type FieldDefinition = {
  id: string;
  name: string;
  normalizedName: string;
  kind: FieldKind;
};

export type DocumentField = {
  id: string;
  definitionId: string;
  regionIds: string[];
};

export const fieldKindLabels: Record<FieldKind, string> = {
  single: 'Valore singolo',
  list: 'Elenco',
  table: 'Tabella',
};

export const fieldKindDescriptions: Record<FieldKind, string> = {
  single: 'Un solo valore, per esempio numero documento o data.',
  list: 'Più valori distinti, per esempio mansioni o rischi.',
  table: 'Più righe organizzate in colonne, per esempio articoli.',
};
