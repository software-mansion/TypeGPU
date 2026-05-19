import type { MatBase } from '../data/matrix.ts';
import { type Snippet } from '../data/snippet.ts';
import type { VecBase } from '../data/vectorImpl.ts';
import type { AnyMatInstance, AnyNumericVecInstance } from '../data/wgslTypes.ts';
import { inCodegenMode } from '../execMode.ts';
import { add, bitShiftLeft, bitShiftRight, div, mod, mul, sub } from '../std/operators.ts';

export const infixOperators = {
  add,
  sub,
  mul,
  div,
  mod,
  bitShiftLeft,
  bitShiftRight,
} as const;

type Numeric = number | AnyNumericVecInstance | AnyMatInstance;

export type InfixOperatorName = keyof typeof infixOperators;
export type InfixOperator = (typeof infixOperators)[InfixOperatorName];

/**
 * InfixDispatch is only used in codegen mode.
 * `lhs` may either be Numeric or Snippet.
 * @example
 * const external = d.vec2u(1);
 * const fn = () => {
 *    'use gpu';
 *    external.mul(2); // lhs is Numeric
 *    d.vec2u(1).mul(2) // lhs is a snippet
 * }
 */
export class InfixDispatch {
  readonly lhs: Snippet | Numeric;
  readonly operator: InfixOperator;

  constructor(lhs: Snippet | Numeric, operator: InfixOperator) {
    this.lhs = lhs;
    this.operator = operator;
  }
}

export function isInfixDispatch(o: unknown): o is InfixDispatch {
  return o instanceof InfixDispatch;
}

/**
 * This function is used on vex/mat prototypes.
 * This is done in runtime in order to avoid a circular dependency.
 */
export function assignInfixOperator<T extends typeof VecBase | typeof MatBase>(
  base: T,
  operator: InfixOperatorName,
  operatorSymbol: symbol,
) {
  const opImpl = infixOperators[operator];

  Object.defineProperty(base.prototype, operatorSymbol, { value: opImpl });

  // Returning this from a getter will work as if this was a vector/matrix's method.
  function jsInfixDispatchFor(this: unknown, arg: unknown) {
    // operator will perform all necessary type checks
    return opImpl(this as never, arg as never);
  }

  Object.defineProperty(base.prototype, operator, {
    get() {
      if (inCodegenMode()) {
        return new InfixDispatch(this, opImpl);
      }
      return jsInfixDispatchFor;
    },
  });
}
