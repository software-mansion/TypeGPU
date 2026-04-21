import { getAttributesString } from '../../data/attributes.ts';
import { undecorate } from '../../data/dataTypes.ts';
import { type KnownSnippetType, type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { type BaseData, isWgslData, isWgslStruct, Void } from '../../data/wgslTypes.ts';
import { MissingLinksError } from '../../errors.ts';
import { getMetaData, getName } from '../../shared/meta.ts';
import { $getNameForward } from '../../shared/symbols.ts';
import type { ResolutionCtx } from '../../types.ts';
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
    argTypes: KnownSnippetType[],
    /**
     * The return type of the function. If undefined, the type should be inferred
     * from the implementation (relevant for shellless functions).
     */
    returnType: KnownSnippetType | undefined,
    /**
     * For entry functions: positional args and optional data struct.
     * When provided, takes precedence over `argTypes` for WGSL header generation.
     */
    entryInput?: SeparatedEntryArgs,
  ): ResolvedSnippet;
}

export function createFnCore(implementation: Implementation, fnAttribute = ''): FnCore {
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

      for (const externals of externalsToApply) {
        applyExternals(externalMap, externals);
      }

      const id = ctx.getUniqueName(this);

      if (typeof implementation === 'string') {
        if (!returnType) {
          throw new Error('Explicit return type is required for string implementation');
        }

        const validArgNames = entryInput
          ? Object.fromEntries(
              entryInput.positionalArgs.map((a) => [a.schemaKey, ctx.makeNameValid(a.schemaKey)]),
            )
          : undefined;

        if (validArgNames && Object.keys(validArgNames).length > 0) {
          applyExternals(externalMap, { in: validArgNames });
        }

        const replacedImpl = replaceExternalsInWgsl(ctx, externalMap, implementation);

        let header = '';
        let body = '';

        if (fnAttribute !== '' && entryInput && validArgNames) {
          const { dataSchema, positionalArgs } = entryInput;
          const parts: string[] = [];
          if (dataSchema && isArgUsedInBody('in', replacedImpl)) {
            parts.push(`in: ${ctx.resolve(dataSchema).value}`);
          }
          for (const a of positionalArgs) {
            const argName = validArgNames[a.schemaKey] ?? '';
            if (argName !== '' && isArgUsedInBody(argName, replacedImpl)) {
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

        ctx.addDeclaration(`${fnAttribute}fn ${id}${header}${body}`);
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
      if (maybeSecondArg && maybeSecondArg.type === 'i' && fnAttribute !== '') {
        applyExternals(externalMap, {
          // oxlint-disable-next-line typescript/no-non-null-assertion -- entry functions cannot be shellless
          [maybeSecondArg.name]: undecorate(returnType!),
        });
      }

      // generate wgsl string

      const {
        head,
        body,
        returnType: actualReturnType,
      } = ctx.fnToWgsl({
        functionType: fnAttribute.includes('@compute')
          ? 'compute'
          : fnAttribute.includes('@vertex')
            ? 'vertex'
            : fnAttribute.includes('@fragment')
              ? 'fragment'
              : 'normal',
        argTypes,
        entryInput,
        params: ast.params,
        returnType,
        body: ast.body,
        externalMap,
      });

      ctx.addDeclaration(
        `${fnAttribute}fn ${id}${ctx.resolve(head).value}${ctx.resolve(body).value}`,
      );

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
