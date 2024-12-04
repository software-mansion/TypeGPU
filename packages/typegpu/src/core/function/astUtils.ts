import type { Block } from 'tinyest';
import type { AnyTgpuData } from '../../types';
import type { TgslImplementation } from './fnTypes';

export type Ast = {
  argNames: string[];
  body: Block;
  externalNames: string[];
};

export type AstInfo = {
  ast: Ast;
  externals?: Record<string, unknown> | undefined;
};

const functionToAstMap = new WeakMap<(...args: unknown[]) => unknown, AstInfo>();

export function getPrebuiltAstFor(fn: (...args: unknown[]) => unknown): AstInfo | undefined {
  return functionToAstMap.get(fn);
}

export function assignAst<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ast: Ast,
  externals?: Record<string, unknown> | undefined,
): T {
  functionToAstMap.set(fn, { ast, externals });
  return fn;
}
