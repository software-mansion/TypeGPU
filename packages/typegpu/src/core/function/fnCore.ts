import { getAttributesString } from '../../data/attributes.ts';
import { undecorate } from '../../data/dataTypes.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { type BaseData, isWgslData, isWgslStruct, Void } from '../../data/wgslTypes.ts';
import { MissingLinksError } from '../../errors.ts';
import { validateIdentifier } from '../../nameUtils.ts';
import { getMetaData, getName } from '../../shared/meta.ts';
import { $getNameForward } from '../../shared/symbols.ts';
import type { ResolutionCtx, TgpuShaderStage } from '../../types.ts';
import { applyExternals, type ExternalMap, replaceExternalsInWgsl } from '../resolve/externals.ts';
import { extractArgs } from './extractArgs.ts';
import type { Implementation, SeparatedEntryArgs } from './fnTypes.ts';

export interface FnCore {
  applyExternals: (newExternals: ExternalMap) => void;
  resolve(
    ctx: ResolutionCtx,
    /**
     * The argument types can be AutoStruct if they're determined based on usage
     * (like in auto-entry functions).
     */
    argTypes: BaseData[],
    /**
     * The return type of the function. If undefined, the type should be inferred
     * from the implementation (relevant for shellless functions).
     */
    returnType: BaseData | undefined,
    /**
     * For entry functions: positional args and optional data struct.
     * When provided, takes precedence over `argTypes` for WGSL header generation.
     */
    entryInput?: SeparatedEntryArgs,
  ): ResolvedSnippet;
}

export function createFnCore(
  implementation: Implementation,
  functionType: 'normal' | TgpuShaderStage,
  workgroupSize?: number[],
): FnCore {
  /**
   * External application has to be deferred until resolution because
   * some externals can reference the owner function which has not been
   * initialized yet (like when accessing the Output struct of a vertex
   * entry fn).
   */
  const externalsToApply: ExternalMap[] = [];

  const core = {
    // Making the implementation the holder of the name, as long as it's
    // a function (and not a string implementation)
    [$getNameForward]: typeof implementation === 'function' ? implementation : undefined,
    applyExternals(newExternals: ExternalMap): void {
      externalsToApply.push(newExternals);
    },

    resolve(
      ctx: ResolutionCtx,
      argTypes: BaseData[],
      returnType: BaseData | undefined,
      entryInput?: SeparatedEntryArgs,
    ): ResolvedSnippet {
      const externalMap: ExternalMap = {};

      let attributes = '';
      if (functionType === 'compute') {
        attributes = `@compute @workgroup_size(${workgroupSize?.join(', ')}) `;
      } else if (functionType === 'vertex') {
        attributes = `@vertex `;
      } else if (functionType === 'fragment') {
        attributes = `@fragment `;
      }

      for (const externals of externalsToApply) {
        applyExternals(externalMap, externals);
      }

      const id = ctx.makeUniqueIdentifier(getName(this), 'global');

      if (typeof implementation === 'string') {
        if (!returnType) {
          throw new Error('Explicit return type is required for string implementation');
        }

        if (entryInput) {
          for (const arg of entryInput.positionalArgs) {
            const result = validateIdentifier(arg.schemaKey);
            if (!result.success) {
              throw new Error(
                `Invalid argument name "${arg.schemaKey}"${result.error ? `: ${result.error}` : ''}`,
              );
            }
          }

          applyExternals(externalMap, {
            in: Object.fromEntries(
              entryInput.positionalArgs.map((a) => [a.schemaKey, a.schemaKey]),
            ),
          });
        }

        const replacedImpl = replaceExternalsInWgsl(ctx, externalMap, implementation);

        let header = '';
        let body = '';

        if (functionType !== 'normal' && entryInput) {
          const { dataSchema, positionalArgs } = entryInput;
          const parts: string[] = [];
          if (dataSchema && isArgUsedInBody('in', replacedImpl)) {
            parts.push(`in: ${ctx.resolve(dataSchema).value}`);
          }
          for (const a of positionalArgs) {
            const argName = a.schemaKey;
            if (isArgUsedInBody(argName, replacedImpl)) {
              parts.push(`${getAttributesString(a.type)}${argName}: ${ctx.resolve(a.type).value}`);
            }
          }
          const input = `(${parts.join(', ')})`;

          const attributes = isWgslData(returnType) ? getAttributesString(returnType) : '';
          const output =
            returnType !== Void
              ? isWgslStruct(returnType)
                ? ` -> ${ctx.resolve(returnType).value} `
                : ` -> ${attributes !== '' ? attributes : '@location(0)'} ${
                    ctx.resolve(returnType).value
                  } `
              : ' ';

          header = `${input}${output}`;
          body = replacedImpl;
        } else {
          const providedArgs = extractArgs(replacedImpl);

          if (providedArgs.args.length !== argTypes.length) {
            throw new Error(
              `WGSL implementation has ${providedArgs.args.length} arguments, while the shell has ${argTypes.length} arguments.`,
            );
          }

          const input = providedArgs.args
            .map(
              (argInfo, i) =>
                `${argInfo.identifier}: ${checkAndReturnType(
                  ctx,
                  `parameter ${argInfo.identifier}`,
                  argInfo.type,
                  argTypes[i],
                )}`,
            )
            .join(', ');

          const output =
            returnType === Void
              ? ' '
              : ` -> ${checkAndReturnType(ctx, 'return type', providedArgs.ret?.type, returnType)} `;

          header = `(${input})${output}`;

          body = replacedImpl.slice(providedArgs.range.end);
        }

        ctx.addDeclaration(`${attributes}fn ${id}${header}${body}`);

        return snip(id, returnType, /* origin */ 'runtime');
      }

      // get data generated by the plugin
      const pluginData = getMetaData(implementation);

      // Passing a record happens prior to version 0.9.0
      // TODO: Support for this can be removed down the line
      const pluginExternals =
        typeof pluginData?.externals === 'function'
          ? pluginData.externals()
          : pluginData?.externals;

      if (pluginExternals) {
        const missing = Object.fromEntries(
          Object.entries(pluginExternals).filter(([name]) => !(name in externalMap)),
        );

        applyExternals(externalMap, missing);
      }

      const ast = pluginData?.ast;
      if (!ast) {
        throw new Error(
          "Missing metadata for tgpu.fn function body (either missing 'use gpu' directive, or misconfigured `unplugin-typegpu`)",
        );
      }

      // verify all required externals are present
      const missingExternals = ast.externalNames.filter((name) => !(name in externalMap));
      if (missingExternals.length > 0) {
        throw new MissingLinksError(getName(this), missingExternals);
      }

      // If an entrypoint implementation has a second argument, it represents the output schema.
      // We look at the identifier chosen by the user and add it to externals.
      const maybeSecondArg = ast.params[1];
      if (maybeSecondArg && maybeSecondArg.type === 'i' && functionType !== 'normal') {
        applyExternals(externalMap, {
          // oxlint-disable-next-line typescript/no-non-null-assertion -- entry functions cannot be shellless
          [maybeSecondArg.name]: undecorate(returnType!),
        });
      }

      // generate wgsl string

      const { code, returnType: actualReturnType } = ctx.fnToWgsl({
        functionType,
        argTypes,
        entryInput,
        params: ast.params,
        returnType,
        body: ast.body,
        externalMap,
      });

      ctx.addDeclaration(`${attributes}fn ${id}${code}`);

      return snip(id, actualReturnType, /* origin */ 'runtime');
    },
  };

  return core;
}

function isArgUsedInBody(argName: string, body: string): boolean {
  return new RegExp(`\\b${argName}\\b`).test(body);
}

function checkAndReturnType(
  ctx: ResolutionCtx,
  name: string,
  wgslType: string | undefined,
  jsType: unknown,
) {
  const resolvedJsType = ctx.resolve(jsType).value.replace(/\s/g, '');

  if (!wgslType) {
    return resolvedJsType;
  }

  const resolvedWgslType = wgslType.replace(/\s/g, '');

  if (resolvedWgslType !== resolvedJsType) {
    throw new Error(
      `Type mismatch between TGPU shell and WGSL code string: ${name}, JS type "${resolvedJsType}", WGSL type "${resolvedWgslType}".`,
    );
  }

  return wgslType;
}
