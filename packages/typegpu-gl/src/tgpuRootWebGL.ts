/**
 * WebGL 2 fallback backend for TypeGPU.
 *
 * Provides a limited implementation of TgpuRoot that uses WebGL 2 instead of WebGPU.
 * Only render pipelines with vertex + fragment shaders are supported.
 * Compute operations, storage buffers, etc. throw WebGLFallbackUnsupportedError.
 */

import {
  d,
  type BufferInitialData,
  type TgpuFixedSampler,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuVertexFn,
  type TextureProps,
} from 'typegpu';

import { WebGLFallbackUnsupportedError } from './errors.ts';
import { CanvasPresenter } from './presenter.ts';
import {
  createWebGLRenderPipeline,
  type TgpuWebGLRenderPipeline,
  type WebGLRenderContext,
} from './webglRenderPipeline.ts';
import {
  WebGLSamplerImpl,
  WebGLTextureImpl,
  asTgpuSampler,
  asTgpuTexture,
} from './webglTexture.ts';
import { WebGLUniformImpl, type WebGLUniform } from './webglUniform.ts';

export class TgpuRootWebGL {
  #gl: WebGL2RenderingContext;
  #offscreen: OffscreenCanvas;
  #presenter: CanvasPresenter;
  #uniforms: WebGLUniformImpl<d.AnyWgslData>[] = [];
  #buffers: WebGLBuffer[] = [];
  #textures: WebGLTextureImpl[] = [];
  #samplers: WebGLSamplerImpl[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#offscreen = gl.canvas as OffscreenCanvas;
    this.#presenter = new CanvasPresenter(this.#offscreen);

    // WGSL's 'flat' interpolation takes the value from the first vertex of a primitive,
    // while GL defaults to the last one. When the extension is missing, integer and
    // explicitly flat varyings read the last vertex's value instead.
    const provokingVertex = gl.getExtension('WEBGL_provoking_vertex');
    provokingVertex?.provokingVertexWEBGL(provokingVertex.FIRST_VERTEX_CONVENTION_WEBGL);
  }

  createBuffer(_typeSchema: d.AnyWgslData, _initial?: unknown): never {
    throw new WebGLFallbackUnsupportedError('createBuffer');
  }

  createUniform<TData extends d.AnyWgslData>(
    typeSchema: TData,
    initial?: BufferInitialData<TData>,
  ): WebGLUniform<TData> {
    const uniform = new WebGLUniformImpl(typeSchema, initial);
    this.#uniforms.push(uniform as unknown as WebGLUniformImpl<d.AnyWgslData>);
    return uniform;
  }

  createMutable(): never {
    throw new WebGLFallbackUnsupportedError('createMutable');
  }

  createReadonly(): never {
    throw new WebGLFallbackUnsupportedError('createReadonly');
  }

  createQuerySet(): never {
    throw new WebGLFallbackUnsupportedError('createQuerySet');
  }

  createBindGroup(): never {
    throw new WebGLFallbackUnsupportedError('createBindGroup');
  }

  createComputePipeline(): never {
    throw new WebGLFallbackUnsupportedError('createComputePipeline');
  }

  createGuardedComputePipeline(): never {
    throw new WebGLFallbackUnsupportedError('createGuardedComputePipeline');
  }

  createCommandEncoder(): never {
    throw new WebGLFallbackUnsupportedError('createCommandEncoder');
  }

  createRenderBundleEncoder(): never {
    throw new WebGLFallbackUnsupportedError('createRenderBundleEncoder');
  }

  createTexture<TProps extends TextureProps>(props: TProps): TgpuTexture<TProps> {
    const texture = new WebGLTextureImpl(this.#gl, props);
    this.#textures.push(texture);
    return asTgpuTexture<TProps>(texture);
  }

  createSampler(props: Parameters<TgpuRoot['createSampler']>[0]): TgpuFixedSampler {
    const sampler = new WebGLSamplerImpl(this.#gl, props);
    this.#samplers.push(sampler);
    return asTgpuSampler(sampler);
  }

  createComparisonSampler(): never {
    throw new WebGLFallbackUnsupportedError('createComparisonSampler');
  }

  unwrap(): never {
    throw new WebGLFallbackUnsupportedError('unwrap');
  }

  get device(): never {
    throw new WebGLFallbackUnsupportedError('device');
  }

  get enabledFeatures(): ReadonlySet<never> {
    return new Set();
  }

  configureContext(options: {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    alphaMode?: string;
  }): WebGLRenderContext {
    return {
      canvas: options.canvas,
      alphaMode: options.alphaMode,
    };
  }

  createRenderPipeline(descriptor: TgpuRenderPipeline.Descriptor): TgpuWebGLRenderPipeline {
    return createWebGLRenderPipeline({
      gl: this.#gl,
      offscreen: this.#offscreen,
      presenter: this.#presenter,
      uniforms: this.#uniforms.slice() as Array<WebGLUniform>,
      descriptor,
    });
  }

  with(_slot: unknown, _value: unknown): this {
    // TODO(#2818): Implement this
    return this;
  }

  withVertex(_entryFn: TgpuVertexFn): never {
    throw new WebGLFallbackUnsupportedError('withVertex is deprecated (use createRenderPipeline)');
  }

  withCompute(): never {
    throw new WebGLFallbackUnsupportedError(
      'withCompute is deprecated (use createComputePipeline)',
    );
  }

  pipe(): this {
    // TODO(#2818): Implement this
    return this;
  }

  destroy(): void {
    this.#presenter.flush();
    for (const buf of this.#buffers) {
      this.#gl.deleteBuffer(buf);
    }
    this.#buffers = [];
    for (const uniform of this.#uniforms) {
      uniform.destroy();
    }
    this.#uniforms = [];
    for (const texture of this.#textures) {
      texture.destroy();
    }
    this.#textures = [];
    for (const sampler of this.#samplers) {
      this.#gl.deleteSampler(sampler.raw);
    }
    this.#samplers = [];
  }
}

export function isGLRoot(value: unknown): value is TgpuRootWebGL {
  return value instanceof TgpuRootWebGL;
}
