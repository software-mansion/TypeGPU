import type { Unwrap } from 'typed-binary';
import { type Callable, CallableImpl } from './callable';
import { inGPUMode } from './gpuMode';
import { valueList } from './resolutionUtils';
import type { AnyTgpuData, ResolutionCtx, TgpuResolvable, Wgsl } from './types';
import { code } from './wgslCode';
import { TgpuIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

type AnyTgpuDataTuple = [AnyTgpuData, ...AnyTgpuData[]] | [];
type UnwrapArgs<T extends AnyTgpuDataTuple> = {
  [Idx in keyof T]: Unwrap<T[Idx]>;
};
type UnwrapReturn<T extends AnyTgpuData | undefined> = T extends undefined
  ? // biome-ignore lint/suspicious/noConfusingVoidType: <void is used as a return type>
    void
  : Unwrap<T>;

/**
 * Describes a function signature (its arguments and return type)
 */
interface TgpuFnShell<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;

  /**
   * Creates an type-safe implementation of this signature
   */
  implement(
    body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ): TgpuFn<Args, Return>;
}

interface TgpuFnBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable {
  $uses(dependencyMap: Record<string, unknown>): this;
}

export interface TgpuFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuFnBase<Args, Return>,
    Callable<UnwrapArgs<Args>, UnwrapReturn<Return>> {
  readonly shell: TgpuFnShell<Args, Return>;
  readonly body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>;
  readonly bodyResolvable: TgpuResolvable;
}

export function fn<Args extends AnyTgpuDataTuple>(): TgpuFnShell<[], undefined>;

export function fn<Return extends AnyTgpuData>(
  returnType: Return,
): TgpuFnShell<[], Return>;

export function fn<Args extends AnyTgpuDataTuple>(
  argTypes: Args,
  returnType?: undefined,
): TgpuFnShell<Args, undefined>;

export function fn<Args extends AnyTgpuDataTuple, Return extends AnyTgpuData>(
  argTypes: Args,
  returnType: Return,
): TgpuFnShell<Args, Return>;

export function fn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
>(first?: Args | Return, second?: Return): TgpuFnShell<Args, Return> {
  if (Array.isArray(first)) {
    return new TgpuFnShellImpl((first ?? []) as Args, second as Return);
  }

  // If only one argument, at is is not an array, it is the return type.
  return new TgpuFnShellImpl([] as Args, first as Return);
}

export function procedure(body: () => void) {
  return fn().implement(body);
}

// --------------
// Implementation
// --------------

class TgpuFnShellImpl<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> implements TgpuFnShell<Args, Return>
{
  constructor(
    public readonly argTypes: Args,
    public readonly returnType: Return,
  ) {}

  implement(
    body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ): TgpuFn<Args, Return> {
    return new TgpuFnImpl<Args, Return>(this, body) as unknown as TgpuFn<
      Args,
      Return
    >;
  }
}

class TgpuFnImpl<
    Args extends AnyTgpuDataTuple,
    Return extends AnyTgpuData | undefined,
  >
  extends CallableImpl<UnwrapArgs<Args>, UnwrapReturn<Return>>
  implements TgpuFnBase<Args, Return>
{
  private _label?: string | undefined;
  private _externalMap: Record<string, Wgsl> = {};
  public readonly bodyResolvable: TgpuResolvable;

  constructor(
    public readonly shell: TgpuFnShell<Args, Return>,
    /** The JS function body passed as an implementation of a TypeGPU function. */
    public readonly body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ) {
    super();

    const self = this as unknown as TgpuFn<Args, Return>;

    this.bodyResolvable = {
      get label() {
        return `${self.label}.body`;
      },

      resolve: (ctx) => {
        const { body } = ctx.transpileFn(self, this._externalMap);
        return ctx.resolve(body);
      },
    } satisfies TgpuResolvable;
  }

  get label() {
    return this._label;
  }

  $name(label: string): this {
    this._label = label;
    return this;
  }

  $uses(externalMap: Record<string, Wgsl>): this {
    this._externalMap = externalMap;
    return this;
  }

  _call(...args: UnwrapArgs<Args>): UnwrapReturn<Return> {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(this, args as Wgsl[]) as UnwrapReturn<Return>;
    }
    return this.body(...args);
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new TgpuIdentifier().$name(this.label);

    const { head, body } = ctx.transpileFn(
      this as unknown as TgpuFn<Args, Return>,
      this._externalMap,
    );
    ctx.addDeclaration(code`fn ${identifier}${head}${body}`);

    return ctx.resolve(identifier);
  }
}

class FnCall implements TgpuResolvable {
  constructor(
    private readonly _fn: TgpuFnBase<AnyTgpuDataTuple, AnyTgpuData | undefined>,
    private readonly _params: Wgsl[],
  ) {}

  get label() {
    return this._fn.label;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(code`${this._fn}(${valueList(this._params)})`);
  }
}
