import { tgpu, d } from 'typegpu';
import { getShaderTarget } from '../internal/context.ts';

/** The functions PixiJS 3D declares for each texture of a material */
export type TextureSlotHelper = 'sample' | 'sampleDirect';

function helperCall(slot: TextureSlot, helper: TextureSlotHelper) {
  return {
    get $(): d.v4f {
      const what = `\`${slot.name}.${helper}()\``;
      const target = getShaderTarget(what);
      if (!target.textureSlot) {
        throw new Error(
          `[@typegpu/pixi] ${what} reads a texture slot of a material, so it can't be called in ${target.label}.`,
        );
      }
      return target.textureSlot(slot, helper) as d.v4f;
    },
  };
}

/**
 * A texture of a PixiJS 3D material, for shader bits to sample.
 * Create one with `textureSlot`.
 */
export class TextureSlot<TName extends string = string> {
  /** The key the texture has in a material's `textures` */
  readonly name: TName;

  /**
   * Samples the texture at `uv`, at the mip level that fits the pixel.
   * Only works in the fragment stage.
   */
  readonly sample: (uv: d.v2f) => d.v4f;

  /** Samples the largest mip level of the texture at `uv`. Works in both stages. */
  readonly sampleDirect: (uv: d.v2f) => d.v4f;

  constructor(name: TName) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(name)) {
      throw new Error(
        `[@typegpu/pixi] '${name}' can't name a texture slot. PixiJS 3D takes camelCase names, like 'heightMap'.`,
      );
    }
    this.name = name;

    // The parameter's name appears in the calls as-is, so it's
    // spelled in a way that nothing else in a shader will be.
    const sampleCall = helperCall(this, 'sample');
    this.sample = tgpu
      .fn(
        [d.vec2f],
        d.vec4f,
      )((_pixiUv) => {
        'use gpu';
        return sampleCall.$;
      })
      .$name(`sample_${name}`);

    const sampleDirectCall = helperCall(this, 'sampleDirect');
    this.sampleDirect = tgpu
      .fn(
        [d.vec2f],
        d.vec4f,
      )((_pixiUv) => {
        'use gpu';
        return sampleDirectCall.$;
      })
      .$name(`sampleDirect_${name}`);
  }
}

/**
 * Declares a texture that a material gives to its shader bits.
 *
 * A bit that samples the slot adds it to every material it's on. The material
 * fills it with any PixiJS texture, through its `textures`, and until then the slot
 * holds a white texture. On the WebGPU renderer, `textureFrom` makes a TypeGPU texture
 * one that fits.
 *
 * PixiJS uploads images with their alpha premultiplied, so divide a sample's `rgb`
 * by its `a` to read the colour an image stores.
 *
 * @param name The slot's key in a material's `textures`, in camelCase
 *
 * @example
 * ```ts
 * const heightMap = p3d.textureSlot('heightMap');
 *
 * const terrainBit = p3d.shaderBit({
 *   name: 'terrain',
 *   vertex: {
 *     beforeTransform: () => {
 *       'use gpu';
 *       const height = heightMap.sampleDirect(p3d.vertex.uv.$).r;
 *       p3d.vertex.position.$ += d.vec4f(p3d.vertex.normal.$ * height, 0);
 *     },
 *   },
 * });
 *
 * const material = new Material3D({ extraBits: [terrainBit], textures: { heightMap: texture } });
 * material.textures.heightMap = anotherTexture;
 * ```
 */
export function textureSlot<TName extends string>(name: TName): TextureSlot<TName> {
  return new TextureSlot(name);
}

/** The name PixiJS 3D gives the function behind a helper of a slot */
export function pixiHelperName(slot: TextureSlot, helper: TextureSlotHelper): string {
  const base = `sample${slot.name.charAt(0).toUpperCase()}${slot.name.slice(1)}`;
  return helper === 'sample' ? base : `${base}Direct`;
}
