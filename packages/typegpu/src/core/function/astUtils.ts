import type { ArgNames, Block } from 'tinyest';
import { isNamable } from '../../namable';

export type Ast = {
  argNames: ArgNames;
  body: Block;
  externalNames: string[];
};

export type AstInfo = {
  ast: Ast;
  externals?: Record<string, unknown> | undefined;
};

const functionToAstMap = new WeakMap<
  (...args: unknown[]) => unknown,
  AstInfo
>();

export function getPrebuiltAstFor(
  fn: (...args: unknown[]) => unknown,
): AstInfo | undefined {
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

export function removedJsImpl(name?: string) {
  return () => {
    throw new Error(
      `The function "${name ?? '<unnamed>'}" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.`,
    );
  };
}

export function autoName<T>(object: T, label: string): T {
  return isNamable(object) && 'label' in object && object.label !== undefined
    ? object.$name(label)
    : object;
}
