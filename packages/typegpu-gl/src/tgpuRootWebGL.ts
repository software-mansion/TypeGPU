/**
 * WebGL 2 fallback backend for TypeGPU.
 *
 * Provides a limited implementation of TgpuRoot that uses WebGL 2 instead of WebGPU.
 * Only render pipelines with vertex + fragment shaders are supported.
 * Compute operations, storage buffers, etc. throw WebGLFallbackUnsupportedError.
 */

import {
  tgpu,
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
import { GlslGenerator, CrossShaderStageState } from './glslGenerator.ts';
import { createStandInRoot } from './standInRoot.ts';
import {
  GLSL_HEADER,
  linkProgram,
  TgpuWebGLRenderPipelineImpl,
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
  #buffers: WebGLBuffer[] = [];
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
  #vao: WebGLVertexArrayObject | undefined;

  #hasFirstProvokingVertex: boolean;
  #warnedAboutProvokingVertex = false;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#offscreen = gl.canvas as OffscreenCanvas;
    // Pipelines use vertex/instance builtins only; no API configures vertex attributes.
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.#vao = vao;
    this.#presenter = CanvasPresenter.for(gl);

    // WGSL's 'flat' interpolation takes the value from the first vertex of a primitive,
    // while GL defaults to the last one. When the extension is missing, integer and
    // explicitly flat varyings read the last vertex's value instead.
    // NOTE: This changes the state of the context, which might have been provided by the user.
    const provokingVertex = gl.getExtension('WEBGL_provoking_vertex');
    provokingVertex?.provokingVertexWEBGL(provokingVertex.FIRST_VERTEX_CONVENTION_WEBGL);
    this.#hasFirstProvokingVertex = !!provokingVertex;
  }

  createBuffer(_typeSchema: d.AnyWgslData, _initial?: unknown): never {
    throw new WebGLFallbackUnsupportedError('createBuffer');
  }

  createUniform<TData extends d.AnyWgslData>(
    typeSchema: TData,
    initial?: BufferInitialData<TData>,
  ): WebGLUniform<TData> {
    return new WebGLUniformImpl(typeSchema, initial);
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

  createRenderPipeline(descriptor: TgpuRenderPipeline.Descriptor): TgpuWebGLRenderPipeline {
    if (!this.#vao) throw new Error('Cannot create a pipeline on a destroyed WebGL root');
    const fakeRoot = createStandInRoot();
    // oxlint-disable-next-line typescript/no-explicit-any
    const fakePipeline = fakeRoot.createRenderPipeline(descriptor as any);

    const crossShaderStageState = new CrossShaderStageState();

    const vertexCode = tgpu.resolve([fakePipeline], {
      unstable_shaderGenerator: new GlslGenerator('vertex', crossShaderStageState),
    });

    const fragmentCode = tgpu.resolve([fakePipeline], {
      unstable_shaderGenerator: new GlslGenerator('fragment', crossShaderStageState),
    });

    const maxVertexAttribs = this.#gl.getParameter(this.#gl.MAX_VERTEX_ATTRIBS) as number;
    for (const [key, { location }] of crossShaderStageState.vertexInputs) {
      if (location >= maxVertexAttribs) {
        throw new WebGLFallbackUnsupportedError(
          `vertex input locations above ${maxVertexAttribs - 1}`,
          `'${key}' is at location ${location}, the maximum on this device is ${maxVertexAttribs - 1}`,
        );
      }
    }

    if (
      !this.#hasFirstProvokingVertex &&
      !this.#warnedAboutProvokingVertex &&
      [...crossShaderStageState.varyingQualifiers.values()].includes('flat ')
    ) {
      this.#warnedAboutProvokingVertex = true;
      console.warn(
        "WebGL fallback: WEBGL_provoking_vertex isn't available, so 'flat' varyings (including integer ones) take their value from the last vertex of a primitive instead of the first.",
      );
    }

    const vertexGlsl = GLSL_HEADER + vertexCode;
    const fragmentGlsl = GLSL_HEADER + fragmentCode;

    const key = vertexGlsl + '\0' + fragmentGlsl;
    let program = this.#programCache.get(key);
    if (!program) {
      program = linkProgram(this.#gl, vertexGlsl, fragmentGlsl);
      this.#programCache.set(key, program);
    }

    return new TgpuWebGLRenderPipelineImpl(
      this.#gl,
      program,
      crossShaderStageState,
      this.#offscreen,
      this.#presenter,
      this.#vao,
    );
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
    if (this.#vao) {
      this.#gl.deleteVertexArray(this.#vao);
      this.#vao = undefined;
    }
    for (const program of this.#programCache.values()) {
      this.#gl.deleteProgram(program);
    }
    this.#programCache.clear();
    for (const buf of this.#buffers) {
      this.#gl.deleteBuffer(buf);
    }
    this.#buffers = [];
    for (const texture of this.#textures) {
      texture.destroy();
    }
    this.#textures.clear();
    for (const raw of this.#rawSamplers) {
      this.#samplerRegistry?.unregister(raw);
      this.#gl.deleteSampler(raw);
    }
    this.#rawSamplers.clear();
  }
}

export function isGLRoot(value: unknown): value is TgpuRootWebGL {
  return value instanceof TgpuRootWebGL;
}
