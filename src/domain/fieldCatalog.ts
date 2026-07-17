import type { FieldDefinition, FieldKind } from './fieldTypes';

export function normalizeFieldName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function cleanFieldName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function validateFieldName(name: string) {
  const cleaned = cleanFieldName(name);
  if (!cleaned) return 'Il nome è obbligatorio.';
  if (cleaned.length < 2) return 'Inserisci almeno 2 caratteri.';
  if (cleaned.length > 80) return 'Il nome può contenere al massimo 80 caratteri.';
  return '';
}

export function findDefinitionByName(catalog: FieldDefinition[], name: string) {
  const normalizedName = normalizeFieldName(name);
  return catalog.find((definition) => definition.normalizedName === normalizedName) ?? null;
}

export function createFieldDefinition(id: string, name: string, kind: FieldKind): FieldDefinition {
  const cleaned = cleanFieldName(name);
  return {
    id,
    name: cleaned,
    normalizedName: normalizeFieldName(cleaned),
    kind,
  };
}

export function addDefinitionIfMissing(
  catalog: FieldDefinition[],
  id: string,
  name: string,
  kind: FieldKind,
) {
  const existing = findDefinitionByName(catalog, name);
  if (existing) {
    return { catalog, definition: existing, created: false };
  }
  const definition = createFieldDefinition(id, name, kind);
  return { catalog: [...catalog, definition], definition, created: true };
}

export function sortDefinitions(catalog: FieldDefinition[]) {
  return [...catalog].sort((first, second) => first.name.localeCompare(second.name, 'it'));
}
