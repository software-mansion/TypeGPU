import { atom, type ExtractAtomArgs } from 'jotai';
import { atomWithLocation } from 'jotai-location';

type Location = {
  pathname?: string;
  searchParams?: URLSearchParams;
  hash?: string;
};

const locationAtom = atomWithLocation();

export const stringParam = {
  encode: (val: string) => val,
  decode: (val: string) => val,
};

export const boolParam = {
  encode: (val: boolean) => (val ? '1' : '0'),
  decode: (val: string) => val === '1',
};

export const numberParam = {
  encode: (val: number) => String(val),
  decode: (val: string) => Number.parseFloat(val),
};

export const objParam = {
  encode: JSON.stringify,
  decode: JSON.parse,
};

export const typeToParam = {
  string: stringParam,
  boolean: boolParam,
  number: numberParam,
  object: objParam,
};

export const atomWithUrl = <T>(
  key: string,
  defaultValue: T,
  options?: { encode: (val: T) => string; decode: (val: string) => unknown },
) => {
  const optionsOrInferred =
    options ?? typeToParam[typeof defaultValue as keyof typeof typeToParam] ?? objParam;

  const { encode, decode } = optionsOrInferred;

  return atom(
    (get) => {
      const location = get(locationAtom);
      return location.searchParams?.has(key)
        ? (decode(location.searchParams.get(key) ?? '') as T)
        : defaultValue;
    },
    (get, set, newValue: T) => {
      const prev = get(locationAtom);
      const searchParams = new URLSearchParams(prev.searchParams);
      searchParams.set(key, encode(newValue));

      set<Location, ExtractAtomArgs<typeof locationAtom>, void>(
        locationAtom,
        {
          ...prev,
          searchParams: searchParams,
        },
        { replace: true },
      );
    },
  );
};
