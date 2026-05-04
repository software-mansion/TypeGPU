import type { Snippet } from '../data/snippet.ts';
import { $internal, isMarkedInternal } from '../shared/symbols.ts';
import type { InfixOperator } from './accessProp.ts';
import { coerceToSnippet } from './generationHelpers.ts';

// Two possible infixDispatch variants
// string, number | vector | matrix, InfixOperator => number | vector | matrix => number | vector | matrix
// string, stnippet, InfixOperator albo samo GPUCallable => Snippet => Snippet
export interface InfixDispatch {
  [$internal]: true;
  type: 'infix-disptach';
  readonly opName: string;
  readonly lhs: Snippet;
  readonly operator: InfixOperator;
  (other: unknown): unknown;
}

export function infixDispatch(
  opName: string,
  lhs: unknown,
  operator: InfixOperator,
): InfixDispatch {
  const lhsSnippet = coerceToSnippet(lhs);
  const callable = (other: unknown) => {
    console.log('infix dispatch called');
    // oxlint-disable-next-line typescript/no-explicit-any
    return operator(lhs as any, other as any);
  };
  const infix = Object.assign(callable, {
    [$internal]: true,
    type: 'infix-disptach' as const,
    opName,
    lhs: lhsSnippet,
    operator,
  });
  return infix as InfixDispatch;
}

export function isInfixDispatch(o: unknown): o is InfixDispatch {
  return isMarkedInternal(o) && (o as InfixDispatch)?.type === 'infix-disptach';
}
