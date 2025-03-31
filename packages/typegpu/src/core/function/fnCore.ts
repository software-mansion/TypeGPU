import type { AnyWgslData } from '../../data/wgslTypes';
import { MissingLinksError } from '../../errors';
import type { ResolutionCtx, Resource } from '../../types';
import {
  type ExternalMap,
  addArgTypesToExternals,
  addReturnTypeToExternals,
  applyExternals,
  replaceExternalsInWgsl,
} from '../resolve/externals';
import { getPrebuiltAstFor } from './astUtils';
import type { Implementation } from './fnTypes';

export interface TgpuFnShellBase<
  Args extends unknown[] | Record<string, unknown>,
  Return,
> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;
}

export interface FnCore {
  label: string | undefined;
  applyExternals(newExternals: ExternalMap): void;
  resolve(ctx: ResolutionCtx, fnAttribute?: string): string;
}

export function createFnCore(
  shell: TgpuFnShellBase<unknown[] | Record<string, unknown>, unknown>,
  implementation: Implementation<unknown[], unknown>,
): FnCore {
  /**
   * External application has to be deferred until resolution because
   * some externals can reference the owner function which has not been
   * initialized yet (like when accessing the Output struct of a vertex
   * entry fn).
   */
  const externalsToApply: ExternalMap[] = [];

  if (typeof implementation === 'string') {
    addArgTypesToExternals(
      implementation,
      Array.isArray(shell.argTypes)
        ? shell.argTypes
        : Object.values(shell.argTypes),
      (externals) => externalsToApply.push(externals),
    );
    addReturnTypeToExternals(implementation, shell.returnType, (externals) =>
      externalsToApply.push(externals),
    );
  }

  return {
    label: undefined as string | undefined,

    applyExternals(newExternals: ExternalMap): void {
      externalsToApply.push(newExternals);
    },

    resolve(ctx: ResolutionCtx, fnAttribute = ''): string {
      const externalMap: ExternalMap = {};

      for (const externals of externalsToApply) {
        applyExternals(externalMap, externals);
      }

      const id = ctx.names.makeUnique(this.label);

      if (typeof implementation === 'string') {
        const replacedImpl = replaceExternalsInWgsl(
          ctx,
          externalMap,
          implementation.trim(),
        );

        ctx.addDeclaration(`${fnAttribute}fn ${id}${replacedImpl}`);
      } else {
        // get data generated by the plugin
        const pluginData = getPrebuiltAstFor(implementation);

        if (pluginData?.externals) {
          const missing = Object.fromEntries(
            Object.entries(pluginData.externals).filter(
              ([name]) => !(name in externalMap),
            ),
          );

          applyExternals(externalMap, missing);
        }
        const ast = pluginData?.ast ?? ctx.transpileFn(String(implementation));

        if (ast.argNames.type === 'destructured-object') {
          applyExternals(
            externalMap,
            Object.fromEntries(
              ast.argNames.props.map(({ prop, alias }) => [alias, prop]),
            ),
          );
        }

        if (
          !Array.isArray(shell.argTypes) &&
          ast.argNames.type === 'identifiers' &&
          ast.argNames.names[0] !== undefined
        ) {
          applyExternals(externalMap, {
            [ast.argNames.names[0]]: Object.fromEntries(
              Object.keys(shell.argTypes).map((arg) => [arg, arg]),
            ),
          });
        }

        // Verifying all required externals are present.
        const missingExternals = ast.externalNames.filter(
          (name) => !(name in externalMap),
        );

        if (missingExternals.length > 0) {
          throw new MissingLinksError(this.label, missingExternals);
        }

        const args: Resource[] = Array.isArray(shell.argTypes)
          ? ast.argNames.type === 'identifiers'
            ? ast.argNames.names.map((name, idx) => ({
                value: name,
                dataType: (shell.argTypes as unknown[])[idx] as AnyWgslData,
              }))
            : []
          : Object.entries(shell.argTypes).map(([name, dataType]) => ({
              value: name,
              dataType: dataType as AnyWgslData,
            }));

        const { head, body } = ctx.fnToWgsl({
          args,
          returnType: shell.returnType as AnyWgslData,
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
