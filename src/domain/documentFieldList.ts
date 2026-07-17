import type { DocumentRegion } from '../components/document/documentGeometry';
import type { DocumentField, FieldDefinition, FieldKind } from './fieldTypes';
import { cleanFieldName } from './fieldCatalog';

export type FieldFilter = 'all' | FieldKind;

export type DocumentFieldListItem = {
  field: DocumentField;
  definition: FieldDefinition;
  regions: DocumentRegion[];
};

export function fieldMatchesSearch(definition: FieldDefinition, query: string) {
  const normalizedQuery = cleanFieldName(query).toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return definition.normalizedName.includes(normalizedQuery);
}

export function filterFieldItems(
  items: DocumentFieldListItem[],
  query: string,
  filter: FieldFilter,
) {
  return items.filter((item) => {
    const matchesKind = filter === 'all' || item.definition.kind === filter;
    return matchesKind && fieldMatchesSearch(item.definition, query);
  });
}

export function sortFieldItemsByDocumentPosition(items: DocumentFieldListItem[]) {
  return [...items].sort((first, second) => {
    const firstRegion = firstRegionInDocument(first.regions);
    const secondRegion = firstRegionInDocument(second.regions);

    if (firstRegion && secondRegion) {
      return (
        firstRegion.pageNumber - secondRegion.pageNumber ||
        firstRegion.rect.y - secondRegion.rect.y ||
        firstRegion.rect.x - secondRegion.rect.x ||
        first.definition.name.localeCompare(second.definition.name, 'it')
      );
    }

    if (firstRegion) return -1;
    if (secondRegion) return 1;
    return first.definition.name.localeCompare(second.definition.name, 'it');
  });
}

export function firstRegionInDocument(regions: DocumentRegion[]) {
  return [...regions].sort(
    (first, second) =>
      first.pageNumber - second.pageNumber ||
      first.rect.y - second.rect.y ||
      first.rect.x - second.rect.x,
  )[0] ?? null;
}

export function formatPages(regions: DocumentRegion[]) {
  const pages = [...new Set(regions.map((region) => region.pageNumber))].sort((a, b) => a - b);
  if (pages.length === 0) return 'P.-';
  if (pages.length === 1) return `P.${pages[0]}`;
  return `P.${pages[0]}-${pages[pages.length - 1]}`;
}

export function countFieldsByKind(definitions: FieldDefinition[]) {
  return {
    all: definitions.length,
    single: definitions.filter((definition) => definition.kind === 'single').length,
    list: definitions.filter((definition) => definition.kind === 'list').length,
    table: definitions.filter((definition) => definition.kind === 'table').length,
  };
}
