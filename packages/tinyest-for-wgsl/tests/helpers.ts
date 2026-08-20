import babel from '@babel/parser';
import type { Node } from '@babel/types';

export const parseBabel = (code: string) =>
  babel.parse(code, { sourceType: 'module', plugins: ['typescript'] }).program.body[0] as Node;
