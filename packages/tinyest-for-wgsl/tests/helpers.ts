import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';
import { transpileFn, type TranspilationOptions, type TranspilationResult } from 'tinyest-for-wgsl';

export const parseRollup = (code: string) => acorn.parse(code, { ecmaVersion: 'latest' });
export const parseBabel = (code: string) =>
  babel.parse(code, { sourceType: 'module', plugins: ['typescript'] }).program.body[0] as Node;

export function dualTest(
  test: <TNode extends Node | acorn.AnyNode>(
    p: (code: string) => TNode,
    transpileFn: (node: TNode, options?: Partial<TranspilationOptions>) => TranspilationResult,
  ) => void,
) {
  return () => {
    test<Node>(parseBabel, (node, options) =>
      transpileFn(node, { ast: 'babel', ...options } as TranspilationOptions<'babel'>),
    );
    test<acorn.AnyNode>(parseRollup, (node, options) =>
      transpileFn(node, { ast: 'acorn', ...options } as TranspilationOptions<'acorn'>),
    );
  };
}
