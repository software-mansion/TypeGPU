import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

const storageOptions = { getOnInit: true };

export const menuShownAtom = atom(false);

export const codeEditorShownAtom = atomWithStorage(
  'code-editor-shown',
  false,
  undefined,
  storageOptions,
);

export const tsoverUsedAtom = atomWithStorage('tsover-used', true, undefined, storageOptions);

export const experimentalExamplesShownAtom = atomWithStorage(
  'experimental-examples-shown',
  true,
  undefined,
  storageOptions,
);

export const groupExamplesByCategoryAtom = atomWithStorage(
  'examples-group-by-category',
  false,
  undefined,
  storageOptions,
);
