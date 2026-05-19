import { type Snippet } from '../data/snippet.ts';
import type { AnyMatInstance, AnyNumericVecInstance } from '../data/wgslTypes.ts';
import type { InfixOperator } from './accessProp.ts';

type Numeric = number | AnyNumericVecInstance | AnyMatInstance;

/**
 * `lhs` may either be Numeric or Snippet.
 * JS infix dispatches are handled differently.
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
