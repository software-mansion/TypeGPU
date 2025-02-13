import type {
  AnyFragmentInputBuiltin,
  AnyFragmentOutputBuiltin,
  OmitBuiltins,
} from '../../builtin';
import type { AnyAttribute } from '../../data/attributes';
import type { AnyWgslStruct } from '../../data/struct';
import type { Decorated, Location, Vec4f } from '../../data/wgslTypes';
import { type TgpuNamable, isNamable } from '../../namable';
import type { GenerationCtx } from '../../smol/wgslGenerator';
import type { Labelled, ResolutionCtx, SelfResolvable } from '../../types';
import { addReturnTypeToExternals } from '../resolve/externals';
import { createFnCore } from './fnCore';
import type { BaseIOData, IORecord, Implementation, InferIO } from './fnTypes';
import {
  type IOLayoutToSchema,
  createOutputType,
  createStructFromIO,
} from './ioOutputType';

// ----------
// Public API
// ----------

export type FragmentOutConstrained =
  | Vec4f
  | Decorated<Vec4f, [Location<number>]>
  | AnyFragmentOutputBuiltin
  | IORecord<
      Vec4f | Decorated<Vec4f, [Location<number>]> | AnyFragmentOutputBuiltin
    >;

export type FragmentInConstrained = IORecord<
  | BaseIOData
  | Decorated<BaseIOData, AnyAttribute<never>[]>
  | AnyFragmentInputBuiltin
>;

/**
 * Describes a fragment entry function signature (its arguments and return type)
 */
export interface TgpuFragmentFnShell<
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
> {
  readonly argTypes: [AnyWgslStruct];
  readonly targets: FragmentOut;
  readonly returnType: FragmentOut;

  /**
   * Creates a type-safe implementation of this signature
   */
  does(
    implementation: (input: InferIO<FragmentIn>) => InferIO<FragmentOut>,
  ): TgpuFragmentFn<OmitBuiltins<FragmentIn>, OmitBuiltins<FragmentOut>>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  does(
    implementation: string,
  ): TgpuFragmentFn<OmitBuiltins<FragmentIn>, OmitBuiltins<FragmentOut>>;
}

export interface TgpuFragmentFn<
  Varying extends FragmentInConstrained = FragmentInConstrained,
  Output extends FragmentOutConstrained = FragmentOutConstrained,
> extends TgpuNamable {
  readonly shell: TgpuFragmentFnShell<Varying, Output>;
  readonly outputType: IOLayoutToSchema<Output>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

export function fragmentFn<
  FragmentOut extends FragmentOutConstrained,
>(options: {
  out: FragmentOut;
  // biome-ignore lint/complexity/noBannedTypes: it's fine
}): TgpuFragmentFnShell<{}, FragmentOut>;

export function fragmentFn<
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
>(options: {
  in: FragmentIn;
  out: FragmentOut;
}): TgpuFragmentFnShell<FragmentIn, FragmentOut>;

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
  // Not allowing single-value input, as using objects here is more
  // readable, and refactoring to use a builtin argument is too much hassle.
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
>(options: {
  in?: FragmentIn;
  out: FragmentOut;
}): TgpuFragmentFnShell<FragmentIn, FragmentOut> {
  return {
    argTypes: [createStructFromIO(options.in ?? {})],
    targets: options.out,
    returnType: createOutputType(options.out) as FragmentOut,

    does(implementation) {
      // biome-ignore lint/suspicious/noExplicitAny: <the usual>
      return createFragmentFn(this, implementation as Implementation) as any;
    },
  };
}

// --------------
// Implementation
// --------------

function createFragmentFn(
  shell: TgpuFragmentFnShell<FragmentInConstrained, FragmentOutConstrained>,
  implementation: Implementation,
): TgpuFragmentFn {
  type This = TgpuFragmentFn & Labelled & SelfResolvable;

  const core = createFnCore(shell, implementation);
  const outputType = shell.returnType as IOLayoutToSchema<
    typeof shell.returnType
  >;
  const inputType = shell.argTypes[0];
  if (typeof implementation === 'string') {
    addReturnTypeToExternals(implementation, outputType, (externals) =>
      core.applyExternals(externals),
    );
  }

  const result: This = {
    shell,
    outputType,

    get label() {
      return core.label;
    },

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    $name(newLabel: string): This {
      core.label = newLabel;
      if (isNamable(outputType)) {
        outputType.$name(`${newLabel}_Output`);
      }
      if (isNamable(inputType)) {
        inputType.$name(`${newLabel}_Input`);
      }
      return this;
    },

    '~resolve'(ctx: ResolutionCtx): string {
      if (typeof implementation === 'string') {
        return core.resolve(ctx, '@fragment ');
      }

      const generationCtx = ctx as GenerationCtx;
      if (generationCtx.callStack === undefined) {
        throw new Error(
          'Cannot resolve a TGSL function outside of a generation context',
        );
      }

      try {
        generationCtx.callStack.push(outputType);
        return core.resolve(ctx, '@fragment ');
      } finally {
        generationCtx.callStack.pop();
      }
    },

    toString() {
      return `fragmentFn:${this.label ?? '<unnamed>'}`;
    },
  };

  return result;
}
