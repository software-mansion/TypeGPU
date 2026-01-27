import { atomWithStorage } from 'jotai/utils';

const storageOptions = { getOnInit: true };

export const menuShownAtom = atomWithStorage(
  'menu-shown',
  true,
  undefined,
  storageOptions,
);

export const codeEditorShownAtom = atomWithStorage(
  'code-editor-shown',
  true,
  undefined,
  storageOptions,
);

export const experimentalExamplesShownAtom = atomWithStorage(
  'experimental-examples-shown',
  true,
  undefined,
  storageOptions,
);
