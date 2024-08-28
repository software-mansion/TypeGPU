import type { Unwrap } from 'typed-binary';
import { type Callable, CallableImpl } from './callable';
import { inGPUMode } from './gpuMode';
import { transpileJsToWgsl } from './js2wgsl';
import { valueList } from './resolutionUtils';
import type { AnyWgslData, ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

type AnyTgpuData = AnyWgslData; // Temporary alias
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
> extends WgslResolvable {
  $uses(dependencyMap: Record<string, unknown>): this;
  readonly wgslSegments: { signature: Wgsl; body: Wgsl };
}

export interface TgpuFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuFnBase<Args, Return>,
    Callable<UnwrapArgs<Args>, UnwrapReturn<Return>> {}

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
  private _signatureWgslMemo: Wgsl | null = null;
  private _bodyWgslMemo: Wgsl | null = null;

  constructor(
    public readonly shell: TgpuFnShell<Args, Return>,
    private readonly _body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ) {
    super();
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

  public get wgslSegments(): { signature: Wgsl; body: Wgsl } {
    if (this._signatureWgslMemo === null || this._bodyWgslMemo === null) {
      const { signature, body } = transpileJsToWgsl(
        {
          argTypes: this.shell.argTypes,
          returnType: this.shell.returnType,
          externalMap: this._externalMap,
        },
        String(this._body),
      );

      this._signatureWgslMemo = signature;
      this._bodyWgslMemo = body;
    }

    return { signature: this._signatureWgslMemo, body: this._bodyWgslMemo };
  }

  _call(...args: UnwrapArgs<Args>): UnwrapReturn<Return> {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(this, args as Wgsl[]) as UnwrapReturn<Return>;
    }
    return this._body(...args);
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this.label);

    const { signature, body } = this.wgslSegments;
    ctx.addDeclaration(code`fn ${identifier}${signature}${body}`);

    return ctx.resolve(identifier);
  }
}

class FnCall implements WgslResolvable {
  constructor(
    private readonly _fn: TgpuFnBase<AnyTgpuDataTuple, AnyWgslData | undefined>,
    private readonly _params: Wgsl[],
  ) {}

  get label() {
    return this._fn.label;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(code`${this._fn}(${valueList(this._params)})`);
  }
}
