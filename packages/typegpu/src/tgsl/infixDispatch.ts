import { type Snippet } from '../data/snippet.ts';
import type { AnyMatInstance, AnyNumericVecInstance } from '../data/wgslTypes.ts';
import { $internal, isMarkedInternal } from '../shared/symbols.ts';
import type { InfixOperator } from './accessProp.ts';

type Numeric = number | AnyNumericVecInstance | AnyMatInstance;

/**
 * InfixDispatch is recognized by the $internal symbol, and lhs may either be Numeric or Snippet.
 * @example
 * const external = d.vec2u(1);
 * const fn = () => {
 *    'use gpu';
 *    external.mul(2); // lhs is Numeric
 *    d.vec2u(1).mul(2) // lhs is a snippet
 * }
 */
export interface InfixDispatch {
  [$internal]: true;
  type: 'infix-dispatch';
  readonly lhs: Snippet | Numeric;
  readonly operator: InfixOperator;
}

export function infixDispatch(lhs: Snippet | Numeric, operator: InfixOperator): InfixDispatch {
  return {
    [$internal]: true as const,
    type: 'infix-dispatch' as const,
    lhs,
    operator,
  };
}

export function isInfixDispatch(o: unknown): o is InfixDispatch {
  return isMarkedInternal(o) && (o as InfixDispatch)?.type === 'infix-dispatch';
}
