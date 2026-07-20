export type FieldKind = 'single' | 'list' | 'table';

export type ScalarValueType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'money'
  | 'boolean';

export type FieldDefinition = {
  id: string;
  name: string;
  normalizedName: string;
  kind: FieldKind;
  valueType: ScalarValueType | null;
  revision: number;
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

export const scalarValueTypeLabels: Record<ScalarValueType, string> = {
  text: 'Testo o codice',
  number: 'Numero',
  date: 'Data',
  datetime: 'Data e ora',
  money: 'Importo monetario',
  boolean: 'Sì/No',
};

export const scalarValueTypeDescriptions: Record<ScalarValueType, string> = {
  text: 'Usalo anche per numeri documento, CAP e codici con lettere o zeri iniziali.',
  number: 'Valori numerici da confrontare o calcolare.',
  date: 'Solo giorno, mese e anno.',
  datetime: 'Data completa con ora.',
  money: 'Importi con valuta o decimali.',
  boolean: 'Risposte come si/no, vero/falso o presente/assente.',
};

export function formatFieldDefinitionMeta(definition: FieldDefinition) {
  if (definition.kind === 'table') return fieldKindLabels.table;
  const kindLabel = definition.kind === 'single' ? 'Singolo' : fieldKindLabels[definition.kind];
  const valueLabel = definition.valueType ? scalarValueTypeLabels[definition.valueType] : scalarValueTypeLabels.text;
  return `${kindLabel} · ${valueLabel}`;
}
