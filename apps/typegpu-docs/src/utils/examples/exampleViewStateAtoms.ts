import { atom } from 'jotai';
import { atomWithSearchParams } from 'jotai-location';
import { atomWithStorage } from 'jotai/utils';

const storageOptions = { getOnInit: true };

export const menuShownAtom = atom(false);

export const exampleFullscreenAtom = atomWithSearchParams('full', false, {
  replace: true,
});

export const tsoverUsedAtom = atomWithStorage('tsover-used', true, undefined, storageOptions);

export const groupExamplesByCategoryAtom = atomWithSearchParams('grouped', false, {
  replace: true,
});
