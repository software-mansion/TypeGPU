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

export type UnwrapReturn<T extends AnyTgpuData | undefined> =
  T extends undefined
    ? // biome-ignore lint/suspicious/noConfusingVoidType: <void is used as a return type>
      void
    : Unwrap<T>;

export type Implementation<
  Args extends AnyTgpuData[],
  Return extends AnyTgpuData | undefined,
> = string | ((...args: UnwrapArgs<Args>) => UnwrapReturn<Return>);
