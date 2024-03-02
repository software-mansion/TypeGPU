import Callable, { AsCallable } from './callable';
import {
  AnyWGSLDataType,
  WGSLFnArgument,
  WGSLValue,
  isPointer,
} from './std140/types';
import { IResolutionCtx, WGSLItem, WGSLSegment } from './types';
import { WGSLCode, code } from './wgslCode';
import { WGSLIdentifier, identifier } from './wgslIdentifier';

type ValuesFromTypes<TArgTypes extends WGSLFnArgument[]> = {
  [K in keyof TArgTypes]: WGSLValue<TArgTypes[K]> & WGSLIdentifier;
};

type PairsFromTypes<TArgTypes extends WGSLFnArgument[]> = {
  [K in keyof TArgTypes]: readonly [WGSLIdentifier, TArgTypes[K]];
};

type SegmentsFromTypes<TArgTypes extends WGSLFnArgument[]> = {
  [K in keyof TArgTypes]: WGSLSegment;
};

class WGSLFunctionCall<
  TArgTypes extends [WGSLFnArgument, ...WGSLFnArgument[]] | [],
  TReturn extends AnyWGSLDataType | undefined = undefined,
> implements WGSLItem
{
  constructor(
    private usedFn: WGSLFunction<TArgTypes, TReturn>,
    private readonly args: SegmentsFromTypes<TArgTypes>,
  ) {}

  resolve(ctx: IResolutionCtx): string {
    const argsCode = this.args.map((argSegment, idx) => {
      const comma = idx < this.args.length - 1 ? ', ' : '';
      return code`${argSegment}${comma}`;
    });

    return ctx.resolve(code`${this.usedFn}(${argsCode})`);
  }
}

export class WGSLFunction<
    TArgTypes extends [WGSLFnArgument, ...WGSLFnArgument[]] | [],
    // TArgPairs extends (readonly [WGSLIdentifier, WGSLFnArgument])[],
    TReturn extends AnyWGSLDataType | undefined = undefined,
  >
  extends Callable<SegmentsFromTypes<TArgTypes>, WGSLFunctionCall<TArgTypes>>
  implements WGSLItem
{
  private identifier = new WGSLIdentifier();

  constructor(
    private argPairs: PairsFromTypes<TArgTypes>,
    private returnType: TReturn | undefined = undefined,
    private readonly body: WGSLSegment,
  ) {
    super();
  }

  alias(debugLabel: string) {
    this.identifier.alias(debugLabel);
    return this;
  }

  resolve(ctx: IResolutionCtx): string {
    const argsCode = this.argPairs.map(([ident, argType], idx) => {
      const comma = idx < this.argPairs.length - 1 ? ', ' : '';

      if (isPointer(argType)) {
        return code`${ident}: ptr<${argType.scope}, ${argType.dataType}>${comma}`;
      }

      return code`${ident}: ${argType}${comma}`;
    });

    if (this.returnType !== undefined) {
      ctx.addDependency(code`fn ${this.identifier}(${argsCode}) -> ${this.returnType} {
        ${this.body}
      }`);
    } else {
      ctx.addDependency(code`fn ${this.identifier}(${argsCode}) {
        ${this.body}
      }`);
    }

    return ctx.resolve(this.identifier);
  }

  _call(...args: SegmentsFromTypes<TArgTypes>) {
    return new WGSLFunctionCall(this, args);
  }
}

export function fn<
  TArgTypes extends [WGSLFnArgument, ...WGSLFnArgument[]] | [],
  TReturn extends AnyWGSLDataType | undefined = undefined,
>(argTypes: TArgTypes, returnType?: TReturn) {
  const argPairs = argTypes.map(
    (argType) => [identifier(), argType] as const,
  ) as PairsFromTypes<TArgTypes>;

  const argValues = argPairs.map(
    ([argIdent, argType]) =>
      argIdent as WGSLValue<typeof argType> & WGSLIdentifier,
  );

  type TArgValues = ValuesFromTypes<TArgTypes>;
  return (bodyProducer: (...args: TArgValues) => WGSLCode) => {
    const body = bodyProducer(...(argValues as TArgValues));

    const fnInstance = new WGSLFunction<TArgTypes, TReturn>(
      argPairs,
      returnType,
      body,
    );

    return fnInstance as AsCallable<
      typeof fnInstance,
      SegmentsFromTypes<TArgTypes>,
      WGSLFunctionCall<TArgTypes>
    >;
  };
}
