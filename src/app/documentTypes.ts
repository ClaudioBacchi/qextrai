export type ViewType = 'pdf' | 'image' | 'unsupported';

export type LocalDocument = {
  file: File;
  name: string;
  mimeType: string;
  size: number;
  viewType: ViewType;
  error?: string;
};

export function createLocalDocument(file: File): LocalDocument {
  const mimeType = file.type || mimeTypeFromName(file.name);
  return {
    file,
    name: file.name,
    mimeType,
    size: file.size,
    viewType: viewTypeFromMime(mimeType, file.name),
  };
}

function viewTypeFromMime(mimeType: string, name: string): ViewType {
  const lowerName = name.toLowerCase();
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png')
  ) {
    return 'image';
  }
  return 'unsupported';
}

function mimeTypeFromName(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  return '';
}
