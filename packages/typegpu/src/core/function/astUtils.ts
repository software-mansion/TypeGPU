import type { Block } from 'packages/tinyest/dist';
import type { AnyTgpuData } from '../..';
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

export const pluginAstInfo = new WeakMap<TgslImplementation, AstInfo>();

export function assignAst<
  Args extends AnyTgpuData[] = AnyTgpuData[],
  Return extends AnyTgpuData | undefined = AnyTgpuData | undefined,
>(
  implementation: TgslImplementation<Args, Return>,
  ast: Ast,
  externals?: Record<string, unknown> | undefined,
): TgslImplementation<Args, Return> {
  pluginAstInfo.set(implementation as TgslImplementation, { ast, externals });
  return implementation;
}
