import { type TgpuRoot } from 'typegpu';
import { TgpuRootWebGL } from './tgpuRootWebGL.ts';
import { GL_CONTEXT_ATTRIBUTES } from './contextAttributes.ts';

export interface InitWithGLOptions {
  /**
   * The context to render with. By default, a context of a new `OffscreenCanvas` is
   * created, and results are copied onto the canvases passed to `configureContext`.
   * A context of an `HTMLCanvasElement` renders into that canvas directly, with no
   * copies, but then it's the only canvas the root can render into.
   */
  gl?: WebGL2RenderingContext;
}

export function initWithGL({ gl: _gl }: InitWithGLOptions = {}): TgpuRoot {
  let gl = _gl;
  if (!gl) {
    const canvas = new OffscreenCanvas(1, 1);
    gl = canvas.getContext('webgl2', GL_CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | undefined;
    if (!gl) {
      throw new Error('Neither WebGPU nor WebGL 2 is available in this environment.');
    }
  }

  return new TgpuRootWebGL(gl) as unknown as TgpuRoot;
}
