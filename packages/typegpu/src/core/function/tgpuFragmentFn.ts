import type {
  AnyFragmentInputBuiltin,
  AnyFragmentOutputBuiltin,
  OmitBuiltins,
} from '../../builtin.ts';
import type { UndecorateRecord } from '../../data/dataTypes.ts';
import type { InstanceToSchema } from '../../data/instanceToSchema.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import type {
  BaseData,
  Decorated,
  Interpolate,
  Location,
  Vec4f,
  Vec4i,
  Vec4u,
  WgslStruct,
} from '../../data/wgslTypes.ts';
import { getName, isNamable, setName, type TgpuNamable } from '../../shared/meta.ts';
import { $getNameForward, $internal, $resolve } from '../../shared/symbols.ts';
import type { Prettify } from '../../shared/utilityTypes.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { addReturnTypeToExternals } from '../resolve/externals.ts';
import { shaderStageSlot } from '../slot/internalSlots.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type { BaseIOData, Implementation, InferIO, IOLayout, IORecord } from './fnTypes.ts';
import { createIoSchema, type IOLayoutToSchema } from './ioSchema.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

export type FragmentInConstrained = IORecord<
  BaseIOData | Decorated<BaseIOData, (Location | Interpolate)[]> | AnyFragmentInputBuiltin
>;

export type VertexOutToVarying<T> = OmitBuiltins<{ [K in keyof T]: InstanceToSchema<T[K]> }>;

type FragmentColorValue = Vec4f | Vec4i | Vec4u;

export type FragmentOutConstrained = IOLayout<
  | FragmentColorValue
  | Decorated<FragmentColorValue, (Location | Interpolate)[]>
  | AnyFragmentOutputBuiltin
>;

/**
 * Describes a fragment entry function signature (its arguments, return type and targets)
 */
type TgpuFragmentFnShellHeader<
  FragmentIn extends TgpuFragmentFn.In = TgpuFragmentFn.In,
  FragmentOut extends TgpuFragmentFn.Out = TgpuFragmentFn.Out,
> = {
  readonly in: FragmentIn | undefined;
  readonly out: FragmentOut;
  readonly returnType: IOLayoutToSchema<FragmentOut>;
  readonly entryPoint: 'fragment';
};

type CleanIO<T> =
  T extends Record<string, BaseData>
    ? Prettify<UndecorateRecord<OmitBuiltins<T>>>
    : // a trick to use a non-record type in place of a record parameter
      Prettify<UndecorateRecord<OmitBuiltins<{ a: T }>>> extends { a: infer Result }
      ? Result
      : Record<string, never>;

/**
 * Describes a fragment entry function signature (its arguments, return type and targets).
 * Allows creating tgpu fragment functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export interface TgpuFragmentFnShell<
  // We force the variance to be covariant, since shells are just containers of
  // schemas that coincidentally can be called to create a fragment function.
  // @ts-expect-error: We override the variance
  out TIn extends TgpuFragmentFn.In = TgpuFragmentFn.In,
  // @ts-expect-error: We override the variance
  out TOut extends TgpuFragmentFn.Out = TgpuFragmentFn.Out,
> extends TgpuFragmentFnShellHeader<TIn, TOut> {
  /**
   * Creates a type-safe implementation of this signature
   */
  (
    implementation: (
      input: InferIO<TIn>,
      out: TOut extends IORecord ? WgslStruct<TOut> : TOut,
    ) => InferIO<TOut>,
  ): TgpuFragmentFn<CleanIO<TIn>, CleanIO<TOut>>;
  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  (implementation: string): TgpuFragmentFn<CleanIO<TIn>, CleanIO<TOut>>;
  (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): TgpuFragmentFn<CleanIO<TIn>, CleanIO<TOut>>;
}

export interface TgpuFragmentFn<
  // @ts-expect-error: We override the variance
  in Varying extends TgpuFragmentFn.In = Record<string, never>,
  out Output extends TgpuFragmentFn.Out = TgpuFragmentFn.Out,
> extends TgpuNamable {
  readonly [$internal]: true;
  readonly shell: TgpuFragmentFnShellHeader<Varying, Output>;
  readonly outputType: IOLayoutToSchema<Output>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

export declare namespace TgpuFragmentFn {
  // Not allowing single-value input, as using objects here is more
  // readable, and refactoring to use a builtin argument is too much hassle.
  type In = Record<string, BaseData>;
  type Out = Record<string, BaseData> | BaseData;
}

export function fragmentFn<FragmentOut extends FragmentOutConstrained>(options: {
  out: FragmentOut;
}): TgpuFragmentFnShell<{}, FragmentOut>;

export function fragmentFn<
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
>(options: { in: FragmentIn; out: FragmentOut }): TgpuFragmentFnShell<FragmentIn, FragmentOut>;

/**
 * Creates a shell of a typed entry function for the fragment shader stage. Any function
 * that implements this shell can run for each fragment (pixel), allowing the inner code
 * to process information received from the vertex shader stage and builtins to determine
 * the final color of the pixel (many pixels in case of multiple targets).
 *
 * @param options.in
 *  Values computed in the vertex stage and builtins to be made available to functions that implement this shell.
 * @param options.out
 *  A `vec4f`, signaling this function outputs a color for one target, or a record containing colors for multiple targets.
 */
export function fragmentFn<
  FragmentIn extends TgpuFragmentFn.In,
  FragmentOut extends TgpuFragmentFn.Out,
>(options: { in?: FragmentIn; out: FragmentOut }): TgpuFragmentFnShell<FragmentIn, FragmentOut> {
  const shell: TgpuFragmentFnShellHeader<FragmentIn, FragmentOut> = {
    in: options.in,
    out: options.out,
    returnType: createIoSchema(options.out),
    entryPoint: 'fragment',
  };

  const call = (arg: Implementation | TemplateStringsArray, ...values: unknown[]) =>
    createFragmentFn(shell, stripTemplate(arg, ...values));

  return Object.assign(call, shell) as unknown as TgpuFragmentFnShell<FragmentIn, FragmentOut>;
}

export function isTgpuFragmentFn<
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
>(value: unknown): value is TgpuFragmentFn<FragmentIn, FragmentOut> {
  return (value as TgpuFragmentFn<FragmentIn, FragmentOut>)?.shell?.entryPoint === 'fragment';
}

// --------------
// Implementation
// --------------

function createFragmentFn(
  shell: TgpuFragmentFnShellHeader,
  implementation: Implementation,
): TgpuFragmentFn {
  type This = TgpuFragmentFn<TgpuFragmentFn.In> &
    SelfResolvable & {
      [$internal]: true;
      [$getNameForward]: FnCore;
    };

  const core = createFnCore(implementation, '@fragment ');
  const outputType = shell.returnType;
  if (typeof implementation === 'string') {
    addReturnTypeToExternals(implementation, outputType, (externals) =>
      core.applyExternals(externals),
    );
  }

  const result: This = {
    shell,
    outputType,

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    [$internal]: true,
    [$getNameForward]: core,
    $name(newLabel: string): This {
      setName(this, newLabel);
      if (isNamable(outputType)) {
        outputType.$name(`${newLabel}_Output`);
      }
      return this;
    },

    [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
      const inputWithLocation = shell.in
        ? createIoSchema(shell.in, ctx.varyingLocations)
        : undefined;

      if (inputWithLocation) {
        inputWithLocation.$name(`${getName(this) ?? ''}_Input`);
        core.applyExternals({ In: inputWithLocation });
      }
      core.applyExternals({ Out: outputType });

      return ctx.withSlots([[shaderStageSlot, 'fragment']], () =>
        core.resolve(ctx, inputWithLocation ? [inputWithLocation] : [], shell.returnType),
      );
    },

    toString() {
      return `fragmentFn:${getName(core) ?? '<unnamed>'}`;
    },
  };

  return result;
}
