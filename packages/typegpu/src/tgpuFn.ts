import type { Unwrap } from 'typed-binary';
import { type AsCallable, CallableImpl } from './callable';
import { transpileJsToWgsl } from './js2wgsl';
import type { AnyWgslData, ResolutionCtx, WgslResolvable } from './types';

// ----------
// Public API
// ----------

let GPU_MODE = false;

export function runOnGPU(callback: () => void) {
  GPU_MODE = true;
  callback();
  GPU_MODE = false;
}

type AnyTgpuData = AnyWgslData; // Temporary alias
type AnyTgpuDataTuple = [AnyTgpuData, ...AnyTgpuData[]];
type ParseArgs<T extends AnyTgpuDataTuple> = {
  [Idx in keyof T]: Unwrap<T[Idx]>;
};

/**
 * Describes a function signature (its arguments and return type)
 */
interface TgpuFnShell<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData,
> {
  readonly argTypes: Args;
  readonly returnType: Return;

  /**
   * Creates an type-safe implementation of this signature
   */
  impl(
    body: (...args: ParseArgs<Args>) => Unwrap<Return>,
  ): TgpuFn<Args, Return> & ((...arg: ParseArgs<Args>) => Unwrap<Return>);
}

export interface TgpuFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData,
> extends WgslResolvable {
  $uses(dependencyMap: Record<string, unknown>): this;
}

export function fn<Args extends AnyTgpuDataTuple, Return extends AnyTgpuData>(
  argTypes: Args,
  returnType: Return,
): TgpuFnShell<Args, Return> {
  return new TgpuFnShellImpl(argTypes, returnType);
}

// --------------
// Implementation
// --------------

class TgpuFnShellImpl<Args extends AnyTgpuDataTuple, Return extends AnyTgpuData>
  implements TgpuFnShell<Args, Return>
{
  constructor(
    public readonly argTypes: Args,
    public readonly returnType: Return,
  ) {}

  impl(body: (...args: ParseArgs<Args>) => Unwrap<Return>) {
    return new TgpuFnImpl<Args, Return>(this, body) as unknown as AsCallable<
      TgpuFn<Args, Return>,
      ParseArgs<Args>,
      Unwrap<Return>
    >;
  }
}

class TgpuFnImpl<Args extends AnyTgpuDataTuple, Return extends AnyTgpuData>
  extends CallableImpl<ParseArgs<Args>, Unwrap<Return>>
  implements TgpuFn<Args, Return>
{
  label?: string | undefined;

  constructor(
    public readonly shell: TgpuFnShell<Args, Return>,
    private readonly _body: (...args: ParseArgs<Args>) => Unwrap<Return>,
  ) {
    super();
  }

  $uses(dependencyMap: Record<string, unknown>): this {
    throw new Error('Method not implemented.');
  }

  _call(...args: ParseArgs<Args>): Unwrap<Return> {
    if (GPU_MODE) {
      const wgsl = transpileJsToWgsl(
        {
          argTypes: this.shell.argTypes,
          returnType: this.shell.returnType,
        },
        String(this._body),
      );
      return wgsl as Unwrap<Return>;
    }
    return this._body(...args);
  }

  resolve(ctx: ResolutionCtx): string {
    throw new Error('Method not implemented.');
  }
}
