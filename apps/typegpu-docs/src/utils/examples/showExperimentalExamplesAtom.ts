import { atomWithStorage } from 'jotai/utils';

export const experimentalExamplesShownAtom = atomWithStorage(
  'experimental-examples-shown',
  true,
  undefined,
  { getOnInit: true },
);
