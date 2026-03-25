import type { AnyVertexInputBuiltin, AnyVertexOutputBuiltin, OmitBuiltins } from '../../builtin.ts';
import type { UndecorateRecord } from '../../data/dataTypes.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import type { BaseData, Decorated, Interpolate, Location } from '../../data/wgslTypes.ts';
import { getName, isNamable, setName, type TgpuNamable } from '../../shared/meta.ts';
import { $getNameForward, $internal, $resolve } from '../../shared/symbols.ts';
import type { Prettify } from '../../shared/utilityTypes.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { shaderStageSlot } from '../slot/internalSlots.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type { BaseIOData, Implementation, InferIO, IORecord } from './fnTypes.ts';
import { createIoSchema, type IOLayoutToSchema } from './ioSchema.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

type VertexInConstrained = IORecord<
  BaseIOData | Decorated<BaseIOData, Location[]> | AnyVertexInputBuiltin
>;

type VertexOutConstrained = IORecord<
  BaseIOData | Decorated<BaseIOData, (Location | Interpolate)[]> | AnyVertexOutputBuiltin
>;

/**
 * Describes a vertex entry function signature (its arguments, return type and attributes)
 */
type TgpuVertexFnShellHeader<
  VertexIn extends TgpuVertexFn.In,
  VertexOut extends TgpuVertexFn.Out,
> = {
  readonly in: VertexIn | undefined;
  readonly out: VertexOut;
  readonly argTypes: [IOLayoutToSchema<VertexIn>] | [];
  readonly entryPoint: 'vertex';
};

type CleanIO<T> =
  T extends Record<string, BaseData>
    ? Prettify<UndecorateRecord<OmitBuiltins<T>>>
    : Prettify<UndecorateRecord<OmitBuiltins<{ a: T }>>> extends { a: infer Result }
      ? Result
      : never;

/**
 * Describes a vertex entry function signature (its arguments, return type and attributes).
 * Allows creating tgpu vertex functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export interface TgpuVertexFnShell<
  // We force the variance to be covariant, since shells are just containers of
  // schemas that coincidentally can be called to create a vertex function.
  // @ts-expect-error: We override the variance
  out TIn extends TgpuVertexFn.In,
  // @ts-expect-error: We override the variance
  out TOut extends TgpuVertexFn.Out,
> extends TgpuVertexFnShellHeader<TIn, TOut> {
  (
    implementation: (input: InferIO<TIn>, out: IOLayoutToSchema<TOut>) => InferIO<TOut>,
  ): TgpuVertexFn<CleanIO<TIn>, CleanIO<TOut>>;
  (implementation: string): TgpuVertexFn<CleanIO<TIn>, CleanIO<TOut>>;
  (strings: TemplateStringsArray, ...values: unknown[]): TgpuVertexFn<CleanIO<TIn>, CleanIO<TOut>>;
}

export interface TgpuVertexFn<
  // @ts-expect-error: We override the variance
  in VertexIn extends TgpuVertexFn.In = Record<string, never>,
  out VertexOut extends TgpuVertexFn.Out = TgpuVertexFn.Out,
> extends TgpuNamable {
  readonly [$internal]: true;
  readonly shell: TgpuVertexFnShellHeader<VertexIn, VertexOut>;
  $uses(dependencyMap: Record<string, unknown>): this;
}

export declare namespace TgpuVertexFn {
  type In = BaseData | Record<string, BaseData>;
  type Out = Record<string, BaseData>;
}

export function vertexFn<VertexOut extends VertexOutConstrained>(options: {
  out: VertexOut;
}): TgpuVertexFnShell<{}, VertexOut>;

export function vertexFn<
  VertexIn extends VertexInConstrained,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends VertexOutConstrained,
>(options: { in: VertexIn; out: VertexOut }): TgpuVertexFnShell<VertexIn, VertexOut>;

/**
 * Creates a shell of a typed entry function for the vertex shader stage. Any function
 * that implements this shell can run for each vertex, allowing the inner code to process
 * attributes and determine the final position of the vertex.
 *
 * @param options.in
 *   Vertex attributes and builtins to be made available to functions that implement this shell.
 * @param options.out
 *   A record containing the final position of the vertex, and any information
 *   passed onto the fragment shader stage.
 */
export function vertexFn<
  VertexIn extends VertexInConstrained,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends VertexOutConstrained,
>(options: { in?: VertexIn; out: VertexOut }): TgpuVertexFnShell<VertexIn, VertexOut> {
  if (Object.keys(options.out).length === 0) {
    throw new Error(
      `A vertexFn output cannot be empty since it must include the 'position' builtin.`,
    );
  }
  const shell: TgpuVertexFnShellHeader<VertexIn, VertexOut> = {
    in: options.in,
    out: options.out,
    argTypes:
      options.in && Object.keys(options.in).length !== 0 ? [createIoSchema(options.in)] : [],
    entryPoint: 'vertex',
  };

  const call = (arg: Implementation | TemplateStringsArray, ...values: unknown[]) =>
    createVertexFn(shell, stripTemplate(arg, ...values));

  return Object.assign(call, shell) as unknown as TgpuVertexFnShell<VertexIn, VertexOut>;
}

export function isTgpuVertexFn<
  VertexIn extends VertexInConstrained,
  VertexOut extends VertexOutConstrained,
>(value: unknown): value is TgpuVertexFn<VertexIn, VertexOut> {
  return (value as TgpuVertexFn<VertexIn, VertexOut>)?.shell?.entryPoint === 'vertex';
}

// --------------
// Implementation
// --------------

function createVertexFn(
  shell: TgpuVertexFnShellHeader<VertexInConstrained, VertexOutConstrained>,
  implementation: Implementation,
): TgpuVertexFn<VertexInConstrained, VertexOutConstrained> {
  type This = TgpuVertexFn<VertexInConstrained, VertexOutConstrained> &
    SelfResolvable & {
      [$internal]: true;
      [$getNameForward]: FnCore;
    };

  const core = createFnCore(implementation, '@vertex ');
  const inputType = shell.argTypes[0];

  const result: This = {
    shell,

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    [$internal]: true,
    [$getNameForward]: core,
    $name(newLabel: string): This {
      setName(this, newLabel);
      if (isNamable(inputType)) {
        inputType.$name(`${newLabel}_Input`);
      }
      return this;
    },

    [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
      const outputWithLocation = createIoSchema(shell.out, ctx.varyingLocations).$name(
        `${getName(this) ?? ''}_Output`,
      );

      if (typeof implementation === 'string') {
        if (inputType) {
          core.applyExternals({ In: inputType });
        }
        core.applyExternals({ Out: outputWithLocation });
      }

      return ctx.withSlots([[shaderStageSlot, 'vertex']], () =>
        core.resolve(ctx, shell.argTypes, outputWithLocation),
      );
    },

    toString() {
      return `vertexFn:${getName(core) ?? '<unnamed>'}`;
    },
  };
  return result;
}
