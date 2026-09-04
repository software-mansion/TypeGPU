import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';
import { transpileFnAcorn, transpileFnBabel, type TranspilationResult } from 'tinyest-for-wgsl';

export const parseRollup = (code: string) => acorn.parse(code, { ecmaVersion: 'latest' });
export const parseBabel = (code: string) =>
  babel.parse(code, { sourceType: 'module', plugins: ['typescript'] }).program.body[0] as Node;

export function dualTest(
  test: <TNode extends Node | acorn.AnyNode>(
    p: (code: string) => TNode,
    transpileFn: (node: TNode) => TranspilationResult,
  ) => void,
) {
  return () => {
    test<Node>(parseBabel, (node) => transpileFnBabel(node));
    test<acorn.AnyNode>(parseRollup, (node) => transpileFnAcorn(node));
  };
}
