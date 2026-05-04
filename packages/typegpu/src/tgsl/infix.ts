import type { Snippet } from '../data/snippet.ts';
import { $internal, isMarkedInternal } from '../shared/symbols.ts';
import type { ResolutionCtx } from '../types.ts';
import { coerceToSnippet } from './generationHelpers.ts';

export interface InfixDispatch {
  [$internal]: true;
  type: 'infix-disptach';
  readonly opName: string;
  readonly lhs: Snippet;
  readonly operator: (ctx: ResolutionCtx, args: [lhs: Snippet, rhs: Snippet]) => Snippet;
  (other: unknown): unknown;
}

export function infixDispatch(
  opName: string,
  lhs: unknown,
  operator: (ctx: ResolutionCtx, args: [lhs: Snippet, rhs: Snippet]) => Snippet, // this is a dualFN, fix this type
): InfixDispatch {
  const lhsSnippet = coerceToSnippet(lhs);
  const callable = (other: unknown) => {
    console.log('infix dispatch called');
    return operator(lhs, other);
  };
  const infix = Object.assign(callable, {
    [$internal]: true,
    type: 'infix-disptach',
    opName,
    lhs: lhsSnippet,
    operator,
  });
  return infix;
}

export function isInfixDispatch(o: unknown): o is InfixDispatch {
  return isMarkedInternal(o) && (o as InfixDispatch)?.type === 'infix-disptach';
}
