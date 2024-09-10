import { type AsCallable, CallableImpl } from './callable';
import { code } from './tgpuCode';
import { TgpuIdentifier } from './tgpuIdentifier';
import { isPointer } from './types';
import type {
  AnyTgpuData,
  ResolutionCtx,
  TgpuFnArgument,
  TgpuNamable,
  TgpuResolvable,
  TgpuValue,
  Wgsl,
} from './types';

// ----------
// Public API
// ----------

export interface TgpuFn<
  TArgTypes extends [TgpuFnArgument, ...TgpuFnArgument[]] | [],
  TReturn extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable,
    CallableImpl<
      SegmentsFromTypes<TArgTypes>,
      TgpuFunctionCall<TArgTypes, TReturn>
    > {}

export function fn<
  TArgTypes extends [TgpuFnArgument, ...TgpuFnArgument[]] | [],
  TReturn extends AnyTgpuData | undefined = undefined,
>(argTypes: TArgTypes, returnType?: TReturn) {
  const argPairs = argTypes.map(
    (argType) => [new TgpuIdentifier(), argType] as const,
  ) as PairsFromTypes<TArgTypes>;

  const argValues = argPairs.map(
    ([argIdent, argType]) =>
      argIdent as TgpuValue<typeof argType> & TgpuIdentifier,
  );

  type TArgValues = ValuesFromTypes<TArgTypes>;
  return (bodyProducer: (...args: TArgValues) => Wgsl) => {
    const body = bodyProducer(...(argValues as TArgValues));

    const fnInstance = new TgpuFnImpl<TArgTypes, TReturn>(
      argPairs,
      returnType,
      body,
    );

    return fnInstance as AsCallable<
      typeof fnInstance,
      SegmentsFromTypes<TArgTypes>,
      TgpuFunctionCall<TArgTypes>
    >;
  };
}

// --------------
// Implementation
// --------------

type ValuesFromTypes<TArgTypes extends TgpuFnArgument[]> = {
  [K in keyof TArgTypes]: TgpuValue<TArgTypes[K]> & TgpuIdentifier;
};

type PairsFromTypes<TArgTypes extends TgpuFnArgument[]> = {
  [K in keyof TArgTypes]: readonly [TgpuIdentifier, TArgTypes[K]];
};

type SegmentsFromTypes<TArgTypes extends TgpuFnArgument[]> = {
  [K in keyof TArgTypes]: Wgsl;
};

class TgpuFunctionCall<
  TArgTypes extends [TgpuFnArgument, ...TgpuFnArgument[]] | [],
  TReturn extends AnyTgpuData | undefined = undefined,
> implements TgpuResolvable
{
  constructor(
    private usedFn: TgpuFn<TArgTypes, TReturn>,
    private readonly args: SegmentsFromTypes<TArgTypes>,
  ) {}

  resolve(ctx: ResolutionCtx): string {
    const argsCode = this.args.map((argSegment, idx) => {
      const comma = idx < this.args.length - 1 ? ', ' : '';
      return code`${argSegment}${comma}`;
    });

    return ctx.resolve(code`${this.usedFn}(${argsCode})`.$name('internal'));
  }

  toString(): string {
    return `fun:${this.usedFn.label ?? '<unnamed>'}()`;
  }
}

class TgpuFnImpl<
    TArgTypes extends [TgpuFnArgument, ...TgpuFnArgument[]] | [],
    // TArgPairs extends (readonly [TgpuIdentifier, TgpuFnArgument])[],
    TReturn extends AnyTgpuData | undefined = undefined,
  >
  extends CallableImpl<
    SegmentsFromTypes<TArgTypes>,
    TgpuFunctionCall<TArgTypes, TReturn>
  >
  implements TgpuFn<TArgTypes, TReturn>
{
  private _label: string | undefined;

  constructor(
    private argPairs: PairsFromTypes<TArgTypes>,
    private returnType: TReturn | undefined,
    private readonly body: Wgsl,
  ) {
    super();
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new TgpuIdentifier().$name(this._label);

    const argsCode = this.argPairs.map(([ident, argType], idx) => {
      const comma = idx < this.argPairs.length - 1 ? ', ' : '';

      if (isPointer(argType)) {
        return code`${ident}: ptr<${argType.scope}, ${argType.pointsTo}>${comma}`;
      }

      return code`${ident}: ${argType}${comma}`;
    });

    if (this.returnType !== undefined) {
      ctx.addDeclaration(code`fn ${identifier}(${argsCode}) -> ${this.returnType} {
        ${this.body}
      }`);
    } else {
      ctx.addDeclaration(code`fn ${identifier}(${argsCode}) {
        ${this.body}
      }`);
    }

    return ctx.resolve(identifier);
  }

  _call(
    ...args: SegmentsFromTypes<TArgTypes>
  ): TgpuFunctionCall<TArgTypes, TReturn> {
    return new TgpuFunctionCall(this, args);
  }

  toString(): string {
    return `fun:${this._label ?? '<unnamed>'}`;
  }
}
