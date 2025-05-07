import { atomWithStorage } from 'jotai/utils';

export const codeEditorShownAtom = atomWithStorage('code-editor-shown', true);
export const codeEditorShownMobileAtom = atomWithStorage(
  'code-editor-mobile-shown',
  false,
);
