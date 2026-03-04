import { atom } from 'jotai';

export const currentSnackbarAtom = atom<string | undefined>(undefined);

export const runWithCatchAtom = atom(null, async (_get, set, callback: () => unknown) => {
  try {
    await callback();
    set(currentSnackbarAtom, undefined);
  } catch (err) {
    if (err instanceof Error) {
      set(currentSnackbarAtom, `${err.name}: ${err.message}`);
    }
    console.log(err);
  }
});
