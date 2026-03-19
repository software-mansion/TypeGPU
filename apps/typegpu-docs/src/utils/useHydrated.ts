import {
  type ExtractAtomArgs,
  type ExtractAtomResult,
  type ExtractAtomValue,
  useAtom,
  type WritableAtom,
} from 'jotai';
import { useEffect, useState } from 'react';

/**
 * Returns true if the component using this hook has already been hydrated.
 * Can be used to change how a component is rendered based on client-state, without
 * tripping up the hydration process.
 */
export function useHydrated() {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated;
}

type AnyWritableAtom = WritableAtom<unknown, never[], unknown>;

type UseHydratedAtomReturn<T extends AnyWritableAtom> = [
  ExtractAtomValue<T>,
  (...args: ExtractAtomArgs<T>) => ExtractAtomResult<T>,
];

/**
 * The same as `useAtom`, but returns `unhydratedValue` instead of the atom's value
 * if the component is yet to be hydrated.
 */
export function useHydratedAtom<T extends AnyWritableAtom>(
  atom: T,
  unhydratedValue: ExtractAtomValue<T>,
): UseHydratedAtomReturn<T> {
  const [atomValue, atomSetter] = useAtom(atom);
  const hydrated = useHydrated();

  return [hydrated ? atomValue : unhydratedValue, atomSetter] as UseHydratedAtomReturn<T>;
}
