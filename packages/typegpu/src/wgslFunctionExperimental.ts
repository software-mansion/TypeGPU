import Callable, { type AsCallable } from './callable';
import { namable, resolvable } from './decorators';
import { ResolvableToStringError } from './errors';
import { isPointer } from './types';
import type {
  AnyWgslData,
  ResolutionCtx,
  Wgsl,
  WgslFnArgument,
  WgslNamable,
  WgslResolvable,
  WgslValue,
} from './types';
import { code } from './wgslCode';
import { type WgslIdentifier, makeIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslFn<
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
> extends WgslResolvable,
    WgslNamable,
    Callable<
      SegmentsFromTypes<TArgTypes>,
      WgslFunctionCall<TArgTypes, TReturn>
    > {}

export function fn<
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
>(argTypes: TArgTypes, returnType?: TReturn) {
  const argPairs = argTypes.map(
    (argType) => [makeIdentifier(), argType] as const,
  ) as PairsFromTypes<TArgTypes>;

  const argValues = argPairs.map(
    ([argIdent, argType]) =>
      argIdent as WgslValue<typeof argType> & WgslIdentifier,
  );

  type TArgValues = ValuesFromTypes<TArgTypes>;
  return (bodyProducer: (...args: TArgValues) => Wgsl) => {
    const body = bodyProducer(...(argValues as TArgValues));

    const fnInstance = new WgslFnImpl<TArgTypes, TReturn>(
      argPairs,
      returnType,
      body,
    );

    return fnInstance as AsCallable<
      typeof fnInstance,
      SegmentsFromTypes<TArgTypes>,
      WgslFunctionCall<TArgTypes>
    >;
  };
}

// --------------
// Implementation
// --------------

type ValuesFromTypes<TArgTypes extends WgslFnArgument[]> = {
  [K in keyof TArgTypes]: WgslValue<TArgTypes[K]> & WgslIdentifier;
};

type PairsFromTypes<TArgTypes extends WgslFnArgument[]> = {
  [K in keyof TArgTypes]: readonly [WgslIdentifier, TArgTypes[K]];
};

type SegmentsFromTypes<TArgTypes extends WgslFnArgument[]> = {
  [K in keyof TArgTypes]: Wgsl;
};

interface WgslFunctionCall<
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
> extends WgslResolvable,
    WgslNamable {
  usedFn: WgslFn<TArgTypes, TReturn>;
  args: SegmentsFromTypes<TArgTypes>;
}

function resolveFunctionCall<
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
>(this: WgslFunctionCall<TArgTypes, TReturn>, ctx: ResolutionCtx) {
  const argsCode = this.args.map((argSegment, idx) => {
    const comma = idx < this.args.length - 1 ? ', ' : '';
    return code`${argSegment}${comma}`;
  });

  return ctx.resolve(code`${this.usedFn}(${argsCode})`.$name('internal'));
}

const makeFunctionCall = <
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
>(
  usedFn: WgslFn<TArgTypes, TReturn>,
  args: SegmentsFromTypes<TArgTypes>,
) =>
  namable(
    resolvable(
      { typeInfo: 'fun' },
      {
        usedFn,
        args,
        resolve: resolveFunctionCall,
        get debugRepr(): string {
          return `fun:${usedFn.label ?? '<unnamed>'}()`;
        },
      },
    ),
  );

class WgslFnImpl<
    TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
    // TArgPairs extends (readonly [WgslIdentifier, WgslFnArgument])[],
    TReturn extends AnyWgslData | undefined = undefined,
  >
  extends Callable<
    SegmentsFromTypes<TArgTypes>,
    WgslFunctionCall<TArgTypes, TReturn>
  >
  implements WgslFn<TArgTypes, TReturn>
{
  private _label: string | undefined;
  readonly typeInfo = 'fun';

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
    const identifier = makeIdentifier().$name(this._label);

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
  ): WgslFunctionCall<TArgTypes, TReturn> {
    return makeFunctionCall(this, args);
  }

  get debugRepr(): string {
    return `${this.typeInfo}:${this.label ?? '<unnamed>'}`;
  }

  toString(): string {
    throw new ResolvableToStringError(this);
  }
}
