import { tgpu, type TgpuRoot } from 'typegpu';
import { GL_CONTEXT_ATTRIBUTES } from './contextAttributes.ts';

export async function initWithGLFallback(): Promise<TgpuRoot> {
  // Try WebGPU first
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      return await tgpu.init();
    } catch {
      // Fall through to WebGL 2
    }
  }

  // Fall back to WebGL 2
  const offscreen = new OffscreenCanvas(1, 1);
  const gl = offscreen.getContext('webgl2', GL_CONTEXT_ATTRIBUTES);
  if (!gl) {
    throw new Error('Neither WebGPU nor WebGL 2 is available in this environment.');
  }

  const { TgpuRootWebGL } = await import('./tgpuRootWebGL.ts');
  // oxlint-disable-next-line typescript/no-explicit-any
  return new TgpuRootWebGL(gl) as any as TgpuRoot;
}
