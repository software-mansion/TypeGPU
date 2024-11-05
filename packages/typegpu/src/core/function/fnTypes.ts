import type { Unwrap } from 'typed-binary';
import type * as smol from '../../smol';
import type { AnyTgpuData, AnyTgpuLooseData } from '../../types';

/**
 * Information extracted from transpiling a JS function.
 */
export type TranspilationResult = {
  argNames: string[];
  body: smol.Block;
  /**
   * All identifiers found in the function code that are not declared in the
   * function itself, or in the block that is accessing that identifier.
   */
  externalNames: string[];
};

export type UnwrapArgs<T extends (AnyTgpuData | AnyTgpuLooseData)[]> = {
  [Idx in keyof T]: Unwrap<T[Idx]>;
};

export type UnwrapReturn<T> = T extends undefined
  ? // biome-ignore lint/suspicious/noConfusingVoidType: <void is used as a return type>
    void
  : Unwrap<T>;

export type Implementation<
  Args extends unknown[] = unknown[],
  Return = unknown,
> = string | ((...args: Args) => Return);

// An IO layout can be...
export type IOLayout =
  // a single data-type
  | AnyTgpuData
  // an object of IO layouts
  | { [key: string]: IOLayout }
  // an array of IO layouts
  | IOLayout[];

export type UnwrapIO<T> = T extends AnyTgpuData
  ? Unwrap<T>
  : T extends IOLayout[]
    ? { [K in keyof T]: UnwrapIO<T[K]> }
    : T extends { [K: string]: IOLayout }
      ? { [K in keyof T]: UnwrapIO<T[K]> }
      : T;
