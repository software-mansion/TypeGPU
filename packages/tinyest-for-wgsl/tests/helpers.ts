import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';
import { transpileFn } from 'tinyest-for-wgsl';
import type { JsNode, TranspilationResult } from '../src/types.ts';

export const parseRollup = (code: string) => acorn.parse(code, { ecmaVersion: 'latest' });
export const parseBabel = (code: string) =>
  babel.parse(code, { sourceType: 'module', plugins: ['typescript'] }).program.body[0] as Node;

export function dualTest(
  test: <TNode extends JsNode>(
    p: (code: string) => TNode,
    transpileFn: (node: TNode) => TranspilationResult,
  ) => void,
) {
  return () => {
    test<Node>(parseBabel, (node) => transpileFn(node, { ast: 'babel' }));
    test<acorn.AnyNode>(parseRollup, (node) => transpileFn(node, { ast: 'acorn' }));
  };
}
