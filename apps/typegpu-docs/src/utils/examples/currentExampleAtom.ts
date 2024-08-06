import { atomWithHash } from 'jotai-location';
import type { RESET } from 'jotai/utils';
import type { WritableAtom } from 'jotai/vanilla';

const options = {
  serialize(val: string | undefined) {
    return val ?? '';
  },
  deserialize(str: string) {
    return str === '' ? undefined : str;
  },
  setHash: (searchParams: string) => {
    if (window.location.hash) {
      window.location.hash = searchParams;
    } else {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${searchParams}`,
      );
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

export const currentExampleAtom: CurrentExampleAtom = atomWithHash<
  string | undefined
>('example', undefined, options);
