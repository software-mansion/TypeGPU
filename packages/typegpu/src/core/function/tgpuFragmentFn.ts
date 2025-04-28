import type {
  AnyFragmentInputBuiltin,
  AnyFragmentOutputBuiltin,
  OmitBuiltins,
} from '../../builtin.ts';
import type { AnyAttribute } from '../../data/attributes.ts';
import type {
  AnyWgslStruct,
  Decorated,
  Location,
  Vec4f,
} from '../../data/wgslTypes.ts';
import { type TgpuNamable, isNamable } from '../../namable.ts';
import type { GenerationCtx } from '../../tgsl/generationHelpers.ts';
import type { Labelled, ResolutionCtx, SelfResolvable } from '../../types.ts';
import { addReturnTypeToExternals } from '../resolve/externals.ts';
import { createFnCore } from './fnCore.ts';
import type {
  BaseIOData,
  IORecord,
  Implementation,
  InferIO,
} from './fnTypes.ts';
import {
  type IOLayoutToSchema,
  createOutputType,
  createStructFromIO,
} from './ioOutputType.ts';
import { stripTemplate } from './templateUtils.ts';

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
 * Describes a fragment entry function signature (its arguments, return type and targets)
 */
type TgpuFragmentFnShellHeader<
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
> = {
  readonly argTypes: [AnyWgslStruct] | [];
  readonly targets: FragmentOut;
  readonly returnType: FragmentOut;
  readonly isEntry: true;
};

/**
 * Describes a fragment entry function signature (its arguments, return type and targets).
 * Allows creating tgpu fragment functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export type TgpuFragmentFnShell<
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
> = TgpuFragmentFnShellHeader<FragmentIn, FragmentOut> /**
 * Creates a type-safe implementation of this signature
 */ &
  ((
    implementation: (input: InferIO<FragmentIn>) => InferIO<FragmentOut>,
  ) => TgpuFragmentFn<OmitBuiltins<FragmentIn>, OmitBuiltins<FragmentOut>>) &
  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  ((
    implementation: string,
  ) => TgpuFragmentFn<OmitBuiltins<FragmentIn>, OmitBuiltins<FragmentOut>>) &
  ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TgpuFragmentFn<OmitBuiltins<FragmentIn>, OmitBuiltins<FragmentOut>>) & {
    /**
     * @deprecated Invoke the shell as a function instead.
     */
    does: ((
      implementation: (input: InferIO<FragmentIn>) => InferIO<FragmentOut>,
    ) => TgpuFragmentFn<OmitBuiltins<FragmentIn>, OmitBuiltins<FragmentOut>>) &
      /**
       * @param implementation
       *   Raw WGSL function implementation with header and body
       *   without `fn` keyword and function name
       *   e.g. `"(x: f32) -> f32 { return x; }"`;
       */
      ((
        implementation: string,
      ) => TgpuFragmentFn<OmitBuiltins<FragmentIn>, OmitBuiltins<FragmentOut>>);
  };

export interface TgpuFragmentFn<
  Varying extends FragmentInConstrained = FragmentInConstrained,
  Output extends FragmentOutConstrained = FragmentOutConstrained,
> extends TgpuNamable {
  readonly shell: TgpuFragmentFnShellHeader<Varying, Output>;
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
  const shell: TgpuFragmentFnShellHeader<FragmentIn, FragmentOut> = {
    argTypes:
      options.in && Object.keys(options.in).length !== 0
        ? [createStructFromIO(options.in)]
        : [],
    targets: options.out,
    returnType: (Object.keys(options.out).length !== 0
      ? createOutputType(options.out)
      : undefined) as FragmentOut,
    isEntry: true,
  };

  const call = (
    arg: Implementation | TemplateStringsArray,
    ...values: unknown[]
  ) => createFragmentFn(shell, stripTemplate(arg, ...values));

  return Object.assign(Object.assign(call, shell), {
    does: call,
  }) as TgpuFragmentFnShell<FragmentIn, FragmentOut>;
}

// --------------
// Implementation
// --------------

function createFragmentFn(
  shell: TgpuFragmentFnShellHeader<
    FragmentInConstrained,
    FragmentOutConstrained
  >,
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
