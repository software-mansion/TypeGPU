import { type TgpuRoot } from 'typegpu';
import { TgpuRootWebGL } from './tgpuRootWebGL.ts';

export interface InitWithGLOptions {
  gl?: WebGL2RenderingContext;
}

export function initWithGL({ gl: _gl }: InitWithGLOptions = {}): TgpuRoot {
  let gl = _gl;
  if (!gl) {
    const canvas = new OffscreenCanvas(1, 1);
    gl = canvas.getContext('webgl2') as WebGL2RenderingContext | undefined;
    if (!gl) {
      throw new Error('Neither WebGPU nor WebGL 2 is available in this environment.');
    }
  }

  if (typeof (gl.canvas as OffscreenCanvas).transferToImageBitmap !== 'function') {
    throw new Error(
      'WebGL 2 context must be created with an OffscreenCanvas, not an HTMLCanvasElement.',
    );
  }

  return new TgpuRootWebGL(gl) as unknown as TgpuRoot;
}
