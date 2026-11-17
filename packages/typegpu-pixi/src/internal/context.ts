import type { d } from 'typegpu';
import type { PixiUniforms, UniformRecord } from '../uniforms.ts';

/**
 * What a `'use gpu'` function is being generated for. Values that only exist
 * inside a PixiJS shader (uniforms, the locals of a material's shader) ask the
 * active target how to reach them.
 */
export interface ShaderTarget {
  /** Shown in error messages, e.g. `the shader bit 'contour'` */
  readonly label: string;
  /** Returns the GPU value of one field of `uniforms` */
  uniformField(uniforms: PixiUniforms<UniformRecord>, key: string): unknown;
  /** Returns the GPU value of one of the values PixiJS 3D declares in its shaders */
  builtin?(builtin: PixiBuiltinLike): unknown;
  /** Returns an expression copied into the shader as-is */
  raw?(expression: string, dataType: d.AnyWgslData): unknown;
  /** Returns the result of sampling a texture of a material, at the `_pixiUv` in scope */
  textureSlot?(slot: TextureSlotLike, helper: 'sample' | 'sampleDirect'): unknown;
}

export interface PixiBuiltinLike {
  readonly label: string;
}

export interface TextureSlotLike {
  readonly name: string;
}

let currentTarget: ShaderTarget | undefined;

export function withShaderTarget<T>(target: ShaderTarget, callback: () => T): T {
  const previous = currentTarget;
  currentTarget = target;
  try {
    return callback();
  } finally {
    currentTarget = previous;
  }
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** @param what What's being accessed, for the error message, e.g. `` `time.$` `` */
export function getShaderTarget(what: string): ShaderTarget {
  if (!currentTarget) {
    throw new Error(
      `[@typegpu/pixi] ${what} can only be read inside a 'use gpu' function that @typegpu/pixi turns into a shader (a filter, a shader bit or a post effect).`,
    );
  }
  return currentTarget;
}
