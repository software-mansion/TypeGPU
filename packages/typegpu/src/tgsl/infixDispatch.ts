import { isSnippet, type Snippet } from '../data/snippet.ts';
import type { AnyMatInstance, AnyNumericVecInstance } from '../data/wgslTypes.ts';
import { $internal, isMarkedInternal } from '../shared/symbols.ts';
import type { InfixOperator } from './accessProp.ts';

type Numeric = number | AnyNumericVecInstance | AnyMatInstance;

/**
 * In wgslGenerator, the lhs may either be Numeric or Snippet,
 * and InfixDispatch is recognized by the $internal symbol.
 * InfixDispatch is not called in wgslGenerator.
 * @example
 * const dispatch = d.vec2u(1).mul;
 * const fn = () => {
 *    'use gpu';
 *    dispatch(2); // lhs is Numeric
 *    d.vec2u(1).mul(2) // lhs is a snippet
 * }
 *
 * In JS, the lhs is always numeric, and InfixDispatch is callable.
 * @example
 * const dispatch = d.vec2u(1).mul;
 * dispatch(2);
 */
export interface InfixDispatch {
  [$internal]: true;
  type: 'infix-dispatch';
  readonly lhs: Snippet | Numeric;
  readonly operator: InfixOperator;
  (other: Numeric): Numeric;
}

export function infixDispatch(lhs: Snippet | Numeric, operator: InfixOperator): InfixDispatch {
  const callable = (other: Numeric | Snippet) => {
    if (isSnippet(lhs)) {
      throw new Error('Unexpected snippet lhs in JS infix operator.');
    }
    // operator will perform all necessary type checks
    return operator(lhs as never, other as never);
  };
  const infix = Object.assign(callable, {
    [$internal]: true as const,
    type: 'infix-dispatch' as const,
    lhs,
    operator,
  });
  return infix;
}

export function isInfixDispatch(o: unknown): o is InfixDispatch {
  return isMarkedInternal(o) && (o as InfixDispatch)?.type === 'infix-dispatch';
}
