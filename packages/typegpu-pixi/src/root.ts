import { RendererType, type Renderer, type WebGPURenderer } from 'pixi.js';
import { tgpu, type TgpuRoot } from 'typegpu';

const roots = new WeakMap<GPUDevice, TgpuRoot>();

/** Whether PixiJS started its WebGPU renderer, rather than WebGL or canvas */
export function isWebGPURenderer(renderer: Renderer): renderer is WebGPURenderer {
  return renderer.type === RendererType.WEBGPU;
}

/**
 * Returns a TypeGPU root that shares the GPU device of a PixiJS renderer.
 *
 * Buffers, textures and compute pipelines created through it live on the device
 * PixiJS draws with. Calling it again with the same renderer returns the same root.
 * Destroying the root leaves the device alone, since PixiJS owns it.
 *
 * @throws If PixiJS didn't start with its WebGPU renderer. Check with `isWebGPURenderer` first.
 *
 * @example
 * ```ts
 * const app = new Application();
 * await app.init({ preference: 'webgpu' });
 *
 * const root = getRoot(app.renderer);
 * const particles = root.createMutable(d.arrayOf(d.vec2f, 1000));
 * ```
 */
export function getRoot(renderer: Renderer): TgpuRoot {
  if (!isWebGPURenderer(renderer)) {
    throw new Error(
      "[@typegpu/pixi] A TypeGPU root needs PixiJS's WebGPU renderer, but PixiJS started with a different one. Pass `preference: 'webgpu'` to `app.init`, and check that the browser supports WebGPU.",
    );
  }

  const device = renderer.gpu.device;
  let root = roots.get(device);
  if (!root) {
    root = tgpu.initFromDevice({ device });
    roots.set(device, root);
  }
  return root;
}
