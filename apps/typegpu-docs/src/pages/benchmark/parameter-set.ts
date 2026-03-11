import { atom, type Getter } from 'jotai';
import { splitAtom } from 'jotai/utils';
import { atomWithUrl } from './atom-with-url.ts';

export type PackageLocator =
  | {
      type: 'npm';
      version?: string;
    }
  | {
      type: 'pr';
      commit?: string;
    }
  | {
      type: 'local';
    };

export interface BenchParameterSet {
  key: number;
  typegpu: PackageLocator;
}

export function stringifyLocator(name: string, locator: PackageLocator): string {
  if (locator.type === 'npm') {
    return `${name}@${locator.version}`;
  }

  if (locator.type === 'pr') {
    return `${name}@${locator.commit}`;
  }

  if (locator.type === 'local') {
    return `${name}:local`;
  }

  return name;
}

function getFreeKey(get: Getter): number {
  return Math.max(...get(parameterSetsAtom).map((params) => params.key)) + 1;
}

export const parameterSetsAtom = atomWithUrl<BenchParameterSet[]>(
  'p',
  [
    { key: 1, typegpu: { type: 'local' } },
    { key: 2, typegpu: { type: 'npm', version: 'latest' } },
  ],
  {
    encode: (values) =>
      values
        .map((value) =>
          value.typegpu.type === 'npm'
            ? `npm-${value.typegpu.version ?? ''}`
            : value.typegpu.type === 'pr'
              ? `pr-${value.typegpu.commit ?? ''}`
              : 'local',
        )
        .join('_'),

    decode: (encoded) =>
      encoded.split('_').map((value, i) =>
        value.startsWith('npm-')
          ? {
              key: i + 1,
              typegpu: {
                type: 'npm',
                version: value.slice('npm-'.length) ?? '',
              },
            }
          : value.startsWith('pr-')
            ? {
                key: i + 1,
                typegpu: {
                  type: 'pr',
                  commit: value.slice('pr-'.length) ?? '',
                },
              }
            : { key: i + 1, typegpu: { type: 'local' } },
      ),
  },
);

export const parameterSetAtomsAtom = splitAtom(parameterSetsAtom, (params) => params.key);

export const createParameterSetAtom = atom(null, (get, set) => {
  const prev = get(parameterSetsAtom);
  const key = getFreeKey(get);

  set(parameterSetsAtom, [...prev, { key, typegpu: { type: 'npm', version: 'latest' } }]);
});

export const deleteParameterSetAtom = atom(null, (get, set, key: number) => {
  const prev = get(parameterSetsAtom);
  set(
    parameterSetsAtom,
    prev.filter((params) => params.key !== key),
  );
});
