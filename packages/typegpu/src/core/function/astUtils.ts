import type { ArgNames, Block } from 'tinyest';
import { setMetaData } from '../../shared/meta.ts';

export type Ast = {
  argNames: ArgNames;
  body: Block;
  externalNames: string[];
};

export function assignAst<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ast: Ast,
  externals?: Record<string, unknown> | undefined,
): T {
  setMetaData(fn, { ast, externals });
  return fn;
}

export function removedJsImpl(name?: string) {
  return () => {
    throw new Error(
      `The function "${
        name ?? '<unnamed>'
      }" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.`,
    );
  };
}
