import Callable, { type AsCallable } from './callable';
import {
  type AnyWgslData,
  type WgslFnArgument,
  type WgslValue,
  isPointer,
} from './std140/types';
import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslFn<
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
> extends WgslResolvable {}

export function fn<
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
>(argTypes: TArgTypes, returnType?: TReturn) {
  const argPairs = argTypes.map(
    (argType) => [new WgslIdentifier(), argType] as const,
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

class WgslFunctionCall<
  TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
  TReturn extends AnyWgslData | undefined = undefined,
> implements WgslResolvable
{
  constructor(
    private usedFn: WgslFn<TArgTypes, TReturn>,
    private readonly args: SegmentsFromTypes<TArgTypes>,
  ) {}

  resolve(ctx: ResolutionCtx): string {
    const argsCode = this.args.map((argSegment, idx) => {
      const comma = idx < this.args.length - 1 ? ', ' : '';
      return code`${argSegment}${comma}`;
    });

    return ctx.resolve(code`${this.usedFn}(${argsCode})`);
  }
}

class WgslFnImpl<
    TArgTypes extends [WgslFnArgument, ...WgslFnArgument[]] | [],
    // TArgPairs extends (readonly [WgslIdentifier, WgslFnArgument])[],
    TReturn extends AnyWgslData | undefined = undefined,
  >
  extends Callable<SegmentsFromTypes<TArgTypes>, WgslFunctionCall<TArgTypes>>
  implements WgslFn<TArgTypes, TReturn>
{
  private identifier = new WgslIdentifier();

  constructor(
    private argPairs: PairsFromTypes<TArgTypes>,
    private returnType: TReturn | undefined,
    private readonly body: Wgsl,
  ) {
    super();
  }

  $name(debugLabel: string) {
    this.identifier.$name(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const argsCode = this.argPairs.map(([ident, argType], idx) => {
      const comma = idx < this.argPairs.length - 1 ? ', ' : '';

      if (isPointer(argType)) {
        return code`${ident}: ptr<${argType.scope}, ${argType.pointsTo}>${comma}`;
      }

      return code`${ident}: ${argType}${comma}`;
    });

    if (this.returnType !== undefined) {
      ctx.addDeclaration(code`fn ${this.identifier}(${argsCode}) -> ${this.returnType} {
        ${this.body}
      }`);
    } else {
      ctx.addDeclaration(code`fn ${this.identifier}(${argsCode}) {
        ${this.body}
      }`);
    }

    return ctx.resolve(this.identifier);
  }

  _call(...args: SegmentsFromTypes<TArgTypes>) {
    return new WgslFunctionCall(this, args);
  }
}
