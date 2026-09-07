import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';

export const parseRollup = (code: string) => acorn.parse(code, { ecmaVersion: 'latest' });
export const parseBabel = (code: string) =>
  babel.parse(code, { sourceType: 'module', plugins: ['typescript'] }).program.body[0] as Node;

export function dualTest(test: (p: (code: string) => Node | acorn.AnyNode) => void) {
  return () => {
    test(parseBabel);
    test(parseRollup);
  };
}
