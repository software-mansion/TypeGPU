import { atom } from 'jotai';

export const currentSnackbarAtom = atom<string | undefined>(undefined);

export const runWithCatchAtom = atom(
  null,
  (_get, set, callback: () => unknown) => {
    try {
      callback();
      set(currentSnackbarAtom, undefined);
    } catch (err) {
      if (err instanceof Error) {
        set(currentSnackbarAtom, `${err.name}: ${err.message}`);
      }
      console.log(err);
    }
  },
);
