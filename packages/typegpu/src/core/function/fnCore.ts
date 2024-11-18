import { MissingLinksError } from '../../errors';
import type { AnyTgpuData, ResolutionCtx, Resource } from '../../types';
import {
  type ExternalMap,
  applyExternals,
  replaceExternalsInWgsl,
} from './externals';
import type { Implementation, TranspilationResult } from './fnTypes';

export interface TgpuFnShellBase<Args extends unknown[], Return> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;
}

interface FnCore {
  label: string | undefined;
  applyExternals(newExternals: ExternalMap): void;
  setAst(ast: TranspilationResult): void;
  resolve(ctx: ResolutionCtx, fnAttribute?: string): string;
}

export function createFnCore(
  shell: TgpuFnShellBase<unknown[], unknown>,
  implementation: Implementation<unknown[], unknown>,
): FnCore {
  const externalMap: ExternalMap = {};
  let prebuiltAst: TranspilationResult | null = null;

  return {
    label: undefined as string | undefined,

    applyExternals(newExternals: ExternalMap): void {
      applyExternals(externalMap, newExternals);
    },

    setAst(ast: TranspilationResult): void {
      prebuiltAst = ast;
    },

    resolve(ctx: ResolutionCtx, fnAttribute = ''): string {
      const id = ctx.names.makeUnique(this.label);

      if (typeof implementation === 'string') {
        const replacedImpl = replaceExternalsInWgsl(
          ctx,
          externalMap,
          implementation.trim(),
        );

        ctx.addDeclaration(`${fnAttribute}fn ${id}${replacedImpl}`);
      } else {
        const ast = prebuiltAst ?? ctx.transpileFn(String(implementation));

        // Verifying all required externals are present.
        const missingExternals = ast.externalNames.filter(
          (name) => !(name in externalMap),
        );

        if (missingExternals.length > 0) {
          throw new MissingLinksError(this.label, missingExternals);
        }

        const args: Resource[] = ast.argNames.map((name, idx) => ({
          value: name,
          dataType: shell.argTypes[idx] as AnyTgpuData,
        }));

        const { head, body } = ctx.fnToWgsl({
          args,
          returnType: shell.returnType as AnyTgpuData,
          body: ast.body,
          externalMap,
        });

        ctx.addDeclaration(
          `${fnAttribute}fn ${id}${ctx.resolve(head)}${ctx.resolve(body)}`,
        );
      }

      return id;
    },
  };
}
