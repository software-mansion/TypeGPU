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
import { RenderTargets } from './renderTargets.ts';
import { VertexArrays } from './vertexArrays.ts';
import {
  createWebGLRenderPipeline,
  linkProgram,
  type TgpuWebGLRenderPipeline,
  type WebGLRenderContext,
} from './webglRenderPipeline.ts';
import {
  WebGLSamplerImpl,
  WebGLTextureImpl,
  asTgpuSampler,
  asTgpuTexture,
} from './webglTexture.ts';
import { WebGLBufferImpl } from './webglBuffer.ts';
import type { WebGLUniformImpl } from './webglUniform.ts';

export class TgpuRootWebGL {
  #gl: WebGL2RenderingContext;
  #offscreen: OffscreenCanvas;
  #presenter: CanvasPresenter;
  #renderTargets: RenderTargets;
  readonly #vertexArrays: VertexArrays;
  readonly #buffers = new Set<WebGLBufferImpl<d.AnyData>>();
  readonly #textures = new Set<WebGLTextureImpl>();
  // Native handles only, so the root doesn't keep sampler wrappers alive.
  readonly #rawSamplers = new Set<WebGLSampler>();
  // Without FinalizationRegistry (e.g. some JS engines), handles are only released on destroy().
  readonly #samplerRegistry =
    typeof FinalizationRegistry === 'undefined'
      ? undefined
      : new FinalizationRegistry<WebGLSampler>((raw) => {
          if (this.#rawSamplers.delete(raw)) {
            this.#gl.deleteSampler(raw);
          }
        });
  #programCache = new Map<string, WebGLProgram>();
  #destroyed = false;

  #hasFirstProvokingVertex: boolean;
  #warnedAboutProvokingVertex = false;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#offscreen = gl.canvas as OffscreenCanvas;
    this.#presenter = CanvasPresenter.for(gl);
    this.#renderTargets = new RenderTargets(gl);
    this.#vertexArrays = new VertexArrays(gl);

    // WGSL's 'flat' interpolation takes the value from the first vertex of a primitive,
    // while GL defaults to the last one. When the extension is missing, integer and
    // explicitly flat varyings read the last vertex's value instead.
    // NOTE: This changes the state of the context, which might have been provided by the user.
    const provokingVertex = gl.getExtension('WEBGL_provoking_vertex');
    provokingVertex?.provokingVertexWEBGL(provokingVertex.FIRST_VERTEX_CONVENTION_WEBGL);
    this.#hasFirstProvokingVertex = !!provokingVertex;
  }

  createBuffer<TData extends d.AnyData>(
    typeSchema: TData,
    initial?: BufferInitialData<TData>,
  ): WebGLBufferImpl<TData> {
    const buffer = new WebGLBufferImpl(this.#gl, typeSchema, initial);
    this.#buffers.add(buffer as WebGLBufferImpl<d.AnyData>);
    // A surviving buffer must not keep the registry and its other buffers alive.
    const buffers = new WeakRef(this.#buffers);
    buffer.onDestroy(() => buffers.deref()?.delete(buffer as WebGLBufferImpl<d.AnyData>));
    return buffer;
  }

  createUniform<TData extends d.AnyWgslData>(
    typeSchema: TData,
    initial?: BufferInitialData<TData>,
  ): WebGLUniformImpl<TData> {
    // Not tracked by the root, so that unused uniforms can be garbage collected. Their data
    // is uploaded with gl.uniform*() calls, so there is no GL buffer to release.
    return new WebGLBufferImpl(this.#gl, typeSchema, initial, ['uniform']).as(
      'uniform',
    ) as WebGLUniformImpl<TData>;
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
    // A surviving texture must not keep the registry and its other textures alive.
    const textures = new WeakRef(this.#textures);
    const texture = new WebGLTextureImpl(this.#gl, props, (destroyed) => {
      textures.deref()?.delete(destroyed);
    });
    this.#textures.add(texture);
    return asTgpuTexture<TProps>(texture);
  }

  createSampler(props: Parameters<TgpuRoot['createSampler']>[0]): TgpuFixedSampler {
    const sampler = new WebGLSamplerImpl(this.#gl, props);
    this.#rawSamplers.add(sampler.raw);
    this.#samplerRegistry?.register(sampler, sampler.raw, sampler.raw);
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
    this.#presenter.register(options.canvas);
    return {
      canvas: options.canvas,
      alphaMode: options.alphaMode,
    };
  }

  #warnIfLastProvokingVertex(): void {
    if (this.#hasFirstProvokingVertex || this.#warnedAboutProvokingVertex) {
      return;
    }
    this.#warnedAboutProvokingVertex = true;
    console.warn(
      "WebGL fallback: WEBGL_provoking_vertex isn't available, so 'flat' varyings (including integer ones) take their value from the last vertex of a primitive instead of the first.",
    );
  }

  createRenderPipeline(descriptor: TgpuRenderPipeline.Descriptor): TgpuWebGLRenderPipeline {
    if (this.#destroyed) throw new Error('Cannot create a pipeline on a destroyed WebGL root');
    return createWebGLRenderPipeline({
      gl: this.#gl,
      offscreen: this.#offscreen,
      presenter: this.#presenter,
      renderTargets: this.#renderTargets,
      vertexArrays: this.#vertexArrays,
      descriptor,
      onFlatVaryings: () => this.#warnIfLastProvokingVertex(),
      getProgram: (vertexGlsl, fragmentGlsl) => this.#getProgram(vertexGlsl, fragmentGlsl),
    });
  }

  #getProgram(vertexGlsl: string, fragmentGlsl: string): WebGLProgram {
    const key = vertexGlsl + '\0' + fragmentGlsl;
    let program = this.#programCache.get(key);
    if (!program) {
      program = linkProgram(this.#gl, vertexGlsl, fragmentGlsl);
      this.#programCache.set(key, program);
    }
    return program;
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
    this.#destroyed = true;
    for (const program of this.#programCache.values()) {
      this.#gl.deleteProgram(program);
    }
    this.#programCache.clear();
    for (const buffer of this.#buffers) {
      buffer.destroy();
    }
    this.#buffers.clear();
    for (const texture of this.#textures) {
      texture.destroy();
    }
    this.#textures.clear();
    for (const raw of this.#rawSamplers) {
      this.#samplerRegistry?.unregister(raw);
      this.#gl.deleteSampler(raw);
    }
    this.#rawSamplers.clear();
    this.#renderTargets.destroy();
    this.#vertexArrays.destroy();
  }
}

export function isGLRoot(value: unknown): value is TgpuRootWebGL {
  return value instanceof TgpuRootWebGL;
}
