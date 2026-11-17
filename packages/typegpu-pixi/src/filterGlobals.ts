/**
 * What PixiJS gives every filter: its global uniforms, the input texture and its sampler.
 *
 * PixiJS's WebGPU renderer binds them at `@group(0)`. Its built-in WGSL filters
 * (for example `pixi.js/lib/filters/defaults/noise/noise.wgsl`) declare them like this:
 *
 *   @group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
 *   @group(0) @binding(1) var uTexture: texture_2d<f32>;
 *   @group(0) @binding(2) var uSampler: sampler;
 *
 * Its WebGL renderer sets them as plain uniforms instead: `uniform vec4 uInputSize;` and so on,
 * and `uniform sampler2D uTexture;` (see `pixi.js/lib/filters/defaults/defaultFilter.vert`).
 *
 * The struct and the binding order below have to match PixiJS exactly. PixiJS doesn't check
 * them, so a mismatch shows up as a wrong picture, not as an error. Compare them with PixiJS's
 * built-in filters after upgrading it.
 */
import { tgpu, d, std } from 'typegpu';
import { getShaderTarget, type ShaderTarget } from './internal/context.ts';

/** The global uniforms PixiJS sets for every filter, in the order its WGSL struct has them */
export const GlobalFilterUniforms = d.struct({
  /** The input texture's size in pixels (xy), and one over that (zw) */
  uInputSize: d.vec4f,
  /** The input texture's size in physical pixels (xy), and one over that (zw) */
  uInputPixel: d.vec4f,
  /** The part of the input texture that holds the picture, in texture coordinates */
  uInputClamp: d.vec4f,
  /** Where the filter draws: the position (xy) and size (zw) of its output in pixels */
  uOutputFrame: d.vec4f,
  /** The position (xy) and size (zw) of the filtered area on the screen, in pixels */
  uGlobalFrame: d.vec4f,
  /** The output texture's size in pixels (xy), and -1 or 1 depending on whether it's flipped (z) */
  uOutputTexture: d.vec4f,
});

/** `@group(0)` of a filter in PixiJS's WebGPU renderer, which PixiJS binds itself */
export const filterGlobalsLayout = tgpu
  .bindGroupLayout({
    gfu: { uniform: GlobalFilterUniforms },
    uTexture: { texture: d.texture2d(d.f32) },
    uSampler: { sampler: 'filtering' },
  })
  .$idx(0);

/** The names PixiJS's WebGL renderer sets for every filter */
export const GLOBAL_UNIFORM_NAMES = Object.keys(
  GlobalFilterUniforms.propTypes,
) as (keyof typeof GlobalFilterUniforms.propTypes)[];

export type FilterGlobalValues = typeof filterGlobalsLayout.$;

/**
 * A shader target that can also say how to reach PixiJS's filter globals.
 * Implemented by the target `createFilter` generates code with.
 */
export interface FilterShaderTarget extends ShaderTarget {
  filterGlobals(): FilterGlobalValues;
}

function isFilterTarget(target: ShaderTarget): target is FilterShaderTarget {
  return typeof (target as Partial<FilterShaderTarget>).filterGlobals === 'function';
}

/**
 * What PixiJS gives every filter, readable inside the `'use gpu'` functions of `createFilter`:
 * - `filterGlobals.$.gfu`: the global uniforms (`uInputSize`, `uInputPixel`, `uInputClamp`,
 *   `uOutputFrame`, `uGlobalFrame` and `uOutputTexture`, all `vec4f`)
 * - `filterGlobals.$.uTexture`: the filter's input texture
 * - `filterGlobals.$.uSampler`: the sampler for the input texture
 *
 * On PixiJS's WebGPU renderer this is the bind group layout PixiJS binds at `@group(0)`.
 * On its WebGL renderer the same fields become the plain uniforms PixiJS sets there.
 *
 * @example
 * ```ts
 * // The size of one input pixel, as a step in texture coordinates
 * const texel = filterGlobals.$.gfu.uInputSize.zw;
 * ```
 */
export const filterGlobals: { readonly $: FilterGlobalValues } = {
  get $(): FilterGlobalValues {
    const target = getShaderTarget('`filterGlobals.$`');
    if (!isFilterTarget(target)) {
      throw new Error(
        `[@typegpu/pixi] \`filterGlobals\` only exists in filters made by \`createFilter\`, so it can't be read in ${target.label}.`,
      );
    }
    return target.filterGlobals();
  },
};

/**
 * Reads the filter's input texture at `uv`, a position in texture coordinates.
 * Equivalent to `std.textureSample(filterGlobals.$.uTexture, filterGlobals.$.uSampler, uv)`.
 */
export const sampleInput = tgpu
  .fn(
    [d.vec2f],
    d.vec4f,
  )((uv) => {
    'use gpu';
    return std.textureSample(filterGlobals.$.uTexture, filterGlobals.$.uSampler, uv);
  })
  .$name('sampleInput');

/**
 * Turns a corner of PixiJS's filter quad (`aPosition`, from 0 to 1) into a clip-space position.
 * The same as `filterVertexPosition` in PixiJS's built-in filters.
 */
export const filterVertexPosition = tgpu
  .fn(
    [d.vec2f],
    d.vec4f,
  )((aPosition) => {
    'use gpu';
    const outputFrame = filterGlobals.$.gfu.uOutputFrame;
    const outputTexture = filterGlobals.$.gfu.uOutputTexture;
    const position = aPosition * outputFrame.zw + outputFrame.xy;
    return d.vec4f(
      position.x * (2 / outputTexture.x) - 1,
      position.y * ((2 * outputTexture.z) / outputTexture.y) - outputTexture.z,
      0,
      1,
    );
  })
  .$name('filterVertexPosition');

/**
 * Turns a corner of PixiJS's filter quad (`aPosition`, from 0 to 1) into a position in the
 * input texture. The same as `filterTextureCoord` in PixiJS's built-in filters.
 */
export const filterTextureCoord = tgpu
  .fn(
    [d.vec2f],
    d.vec2f,
  )((aPosition) => {
    'use gpu';
    return aPosition * (filterGlobals.$.gfu.uOutputFrame.zw * filterGlobals.$.gfu.uInputSize.zw);
  })
  .$name('filterTextureCoord');

/**
 * The vertex stage filters have when they don't bring their own: it places PixiJS's
 * filter quad and passes `uv`, the position in the input texture, to the fragment stage.
 * The same as `mainVertex` in PixiJS's built-in filters.
 */
export const filterVertex = tgpu
  .vertexFn({
    in: { aPosition: d.vec2f },
    out: { position: d.builtin.position, uv: d.vec2f },
  })(({ aPosition }) => {
    'use gpu';
    return {
      position: filterVertexPosition(aPosition),
      uv: filterTextureCoord(aPosition),
    };
  })
  .$name('filterVertex');
