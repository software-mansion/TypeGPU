import { atomWithHash } from 'jotai-location';
import type { RESET } from 'jotai/utils';
import type { WritableAtom } from 'jotai/vanilla';
import { PLAYGROUND_KEY } from './exampleContent.ts';

const exampleHashPrefix = `example=${PLAYGROUND_KEY}`;

const options = {
  serialize(val: string | undefined) {
    return val ?? '';
  },
  deserialize(str: string) {
    return str === '' ? undefined : str;
  },
  setHash: (searchParams: string) => {
    if (
      !window.location.hash ||
      (window.location.hash.startsWith(`#${exampleHashPrefix}`) &&
        searchParams.startsWith(exampleHashPrefix))
    ) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${searchParams}`,
      );
    } else {
      window.location.hash = searchParams;
    }
  },
};

type SetStateActionWithReset<Value> =
  | Value
  | typeof RESET
  | ((prev: Value) => Value | typeof RESET);

type CurrentExampleAtom = WritableAtom<
  string | undefined,
  [SetStateActionWithReset<string | undefined>],
  void
>;

export const currentExampleAtom = atomWithHash<string | undefined>(
  'example',
  undefined,
  options,
) as CurrentExampleAtom;
