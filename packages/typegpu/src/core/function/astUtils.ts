import type { Block } from 'packages/tinyest/dist';
import type { AnyTgpuData } from '../..';
import type { TgslImplementation } from './fnTypes';

export type Ast = {
  argNames: string[];
  body: Block;
  externalNames: string[];
};

export const implementationToAst = new WeakMap<TgslImplementation, Ast>();
export const implementationToExternals = new WeakMap<
  TgslImplementation,
  Record<string, unknown>
>();

export function assignAst<
  Args extends AnyTgpuData[] = AnyTgpuData[],
  Return extends AnyTgpuData | undefined = AnyTgpuData | undefined,
>(
  implementation: TgslImplementation<Args, Return>,
  ast: Ast,
  externals?: Record<string, unknown> | undefined,
): TgslImplementation<Args, Return> {
  if (externals) {
    implementationToExternals.set(
      implementation as TgslImplementation,
      externals,
    );
  }
  implementationToAst.set(implementation as TgslImplementation, ast);
  return implementation;
}
