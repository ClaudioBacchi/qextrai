import type { DocumentTemplate } from './documentTemplates';

export type UnsavedLayoutWarning =
  | {
      kind: 'template';
      title: 'Modifiche non salvate';
      description: string;
      saveActionLabel: 'Salva e continua';
    }
  | {
      kind: 'layout';
      title: 'Layout non salvato';
      description: 'Le aree definite nel documento non sono ancora state salvate come template. Se continui, andranno perse.';
      saveActionLabel: 'Salva come template';
    };

export type UnsavedLayoutChoice = 'stay' | 'discard' | 'save';

export type UnsavedLayoutChoiceResult = {
  shouldContinue: boolean;
  keepLocalChanges: boolean;
  keepDialogOpen: boolean;
};

export function getUnsavedLayoutWarning({
  activeTemplate,
  templateDirty,
  fieldCount,
}: {
  activeTemplate: DocumentTemplate | null;
  templateDirty: boolean;
  fieldCount: number;
}): UnsavedLayoutWarning | null {
  if (activeTemplate && templateDirty) {
    return {
      kind: 'template',
      title: 'Modifiche non salvate',
      description: `Hai modificato il template «${activeTemplate.name}». Se continui, queste modifiche andranno perse.`,
      saveActionLabel: 'Salva e continua',
    };
  }

  if (!activeTemplate && fieldCount > 0) {
    return {
      kind: 'layout',
      title: 'Layout non salvato',
      description: 'Le aree definite nel documento non sono ancora state salvate come template. Se continui, andranno perse.',
      saveActionLabel: 'Salva come template',
    };
  }

  return null;
}

export function resolveUnsavedLayoutChoice(
  choice: UnsavedLayoutChoice,
  saveSucceeded = false,
): UnsavedLayoutChoiceResult {
  if (choice === 'stay') {
    return {
      shouldContinue: false,
      keepLocalChanges: true,
      keepDialogOpen: false,
    };
  }

  if (choice === 'discard') {
    return {
      shouldContinue: true,
      keepLocalChanges: false,
      keepDialogOpen: false,
    };
  }

  return {
    shouldContinue: saveSucceeded,
    keepLocalChanges: !saveSucceeded,
    keepDialogOpen: !saveSucceeded,
  };
}
