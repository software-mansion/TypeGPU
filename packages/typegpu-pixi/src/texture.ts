import { ExternalSource, type Renderer, Texture } from 'pixi.js';
import type { TgpuTexture } from 'typegpu';
import { getRoot, isWebGPURenderer } from './root.ts';

// `GPUTextureUsage.TEXTURE_BINDING`, which isn't a global everywhere this code is loaded
const TEXTURE_BINDING = 0x04;

export interface TextureFromOptions {
  /** A name for the PixiJS texture source, shown by debugging tools */
  label?: string | undefined;
}

/**
 * Wraps a TypeGPU texture in a PixiJS texture, without copying it.
 *
 * The result is a regular PixiJS `Texture`: put it on a sprite or a mesh, or in a texture
 * slot of a PixiJS 3D material. It shows whatever the TypeGPU texture holds at the time
 * PixiJS draws, so a pipeline can keep rendering into the texture.
 *
 * PixiJS expects colours with premultiplied alpha. Destroying the PixiJS texture leaves
 * the TypeGPU texture alone, and the other way round the PixiJS texture must not be drawn
 * once the TypeGPU texture is destroyed.
 *
 * @param texture A 2D texture created by the root that `getRoot(renderer)` returns,
 *   with the `'sampled'` usage
 * @throws If PixiJS didn't start with its WebGPU renderer, or the texture can't be sampled
 *
 * @example
 * ```ts
 * const root = getRoot(app.renderer);
 * const canvasTexture = root
 *   .createTexture({ size: [512, 512], format: 'rgba8unorm' })
 *   .$usage('sampled', 'render');
 *
 * const sprite = new Sprite(textureFrom(app.renderer, canvasTexture));
 * app.stage.addChild(sprite);
 * ```
 */
export function textureFrom(
  renderer: Renderer,
  texture: TgpuTexture,
  options?: TextureFromOptions,
): Texture {
  if (!isWebGPURenderer(renderer)) {
    throw new Error(
      "[@typegpu/pixi] A TypeGPU texture only exists on PixiJS's WebGPU renderer, but PixiJS started with a different one.",
    );
  }

  const gpuTexture = getRoot(renderer).unwrap(texture);
  if ((gpuTexture.usage & TEXTURE_BINDING) === 0) {
    throw new Error(
      "[@typegpu/pixi] PixiJS can only draw with a texture that can be sampled. Add `.$usage('sampled')` to the TypeGPU texture.",
    );
  }

  const label = options?.label === undefined ? {} : { label: options.label };
  const source = new ExternalSource({ resource: gpuTexture, renderer, ...label });
  // PixiJS reads the format when the texture is drawn into, or copied
  source.format = texture.props.format;
  return new Texture({ source, ...label });
}
