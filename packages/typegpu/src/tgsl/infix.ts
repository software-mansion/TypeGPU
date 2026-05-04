import type { Snippet } from '../data/snippet.ts';
import { $infixDispatch } from '../shared/symbols.ts';
import type { ResolutionCtx } from '../types.ts';
import { coerceToSnippet } from './generationHelpers.ts';

export interface InfixDispatch {
  [$infixDispatch]: true;
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
    [$infixDispatch]: true as const,
    opName,
    lhs: lhsSnippet,
    operator,
  });
  return infix;
}
