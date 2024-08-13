import type { Parsed } from 'typed-binary';
import type { AnyWgslData, Eventual, WgslResolvable } from '../types';

interface Readable<T> extends WgslResolvable {
  // hello
}

type Value<T extends AnyWgslData> = Eventual<Parsed<T>> | Readable<T>;

type ValuesFromTypes<TArgTypes extends AnyWgslData[]> = {
  [K in keyof TArgTypes]: Value<TArgTypes[K]>;
};

export function $fn<
  TArgTypes extends [AnyWgslData, ...AnyWgslData[]],
  TReturnType,
>(
  argTypes: TArgTypes,
  body: (...args: ValuesFromTypes<TArgTypes>) => TReturnType,
): (...args: ValuesFromTypes<TArgTypes>) => TReturnType {
  return (...args: ValuesFromTypes<TArgTypes>) => {
    return body(...args);
  };
}
