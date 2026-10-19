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
  patchArrayBuffer,
  readFromArrayBuffer,
  writeToArrayBuffer,
  type BufferInitialData,
  type BufferWriteOptions,
  type TgpuBuffer,
  type TgpuFixedSampler,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuVertexFn,
  type TextureProps,
} from 'typegpu';
import { getName, makeDereferenceable, makeResolvable, setName, snip } from 'typegpu/~internal';

import { GlslGenerator, CrossShaderStageState, getCrossShaderStageState } from './glslGenerator.ts';
import {
  WebGLSamplerImpl,
  WebGLTextureImpl,
  WebGLTextureRenderView,
  WebGLTextureView,
  asTgpuSampler,
  asTgpuTexture,
} from './webglTexture.ts';

// ----------
// Public API
// ----------

export class WebGLFallbackUnsupportedError extends Error {
  constructor(operation: string) {
    super(
      `WebGL fallback does not support '${operation}'. Use WebGPU for full TypeGPU functionality.`,
    );
    this.name = 'WebGLFallbackUnsupportedError';
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, WebGLFallbackUnsupportedError.prototype);
  }
}

export interface WebGLRenderContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly alphaMode?: string | undefined;
}

export interface TgpuWebGLRenderPipeline {
  withColorAttachment(attachment: WebGLColorAttachment): this;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number): void;
}

interface WebGLColorAttachment {
  view: WebGLRenderContext | WebGLTextureRenderView;
  loadOp?: GPULoadOp;
  storeOp?: GPUStoreOp;
  clearValue?: GPUColor;
}

interface WebGLUniform<TData extends d.AnyWgslData = d.AnyWgslData> {
  readonly resourceType: 'uniform';
  readonly dataType: TData;
  write(data: d.Infer<TData>): void;

  readonly $: d.InferGPU<TData>;

  /** @internal The latest ArrayBuffer representation of the written data */
  readonly buffer: ArrayBuffer;
}

// ----------
// Implementation
// ----------

const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;

`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed:\n${log}\n\nSource:\n${source}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);

  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create WebGL program');

  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  gl.deleteShader(vert);
  gl.deleteShader(frag);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program linking failed: ${log}`);
  }

  return program;
}

interface UniformBinding {
  uniform: WebGLUniform;
  location: WebGLUniformLocation;
  setter: (gl: WebGL2RenderingContext, loc: WebGLUniformLocation, data: ArrayBuffer) => void;
}

interface TextureBinding {
  view: WebGLTextureView;
  sampler: WebGLSamplerImpl | undefined;
  location: WebGLUniformLocation;
  flipLocation: WebGLUniformLocation | null;
}

function uniformSetterFor(
  schema: d.AnyWgslData,
): (gl: WebGL2RenderingContext, loc: WebGLUniformLocation, dataView: ArrayBuffer) => void {
  const typeName = (schema as { type: string }).type;
  if (typeName === 'f32')
    return (gl, loc, data) => gl.uniform1f(loc, new Float32Array(data)[0] ?? 0);
  if (typeName === 'u32')
    return (gl, loc, data) => gl.uniform1ui(loc, new Uint32Array(data)[0] ?? 0);
  if (typeName === 'i32') return (gl, loc, data) => gl.uniform1i(loc, new Int32Array(data)[0] ?? 0);
  if (typeName === 'vec2f') return (gl, loc, data) => gl.uniform2fv(loc, new Float32Array(data));
  if (typeName === 'vec3f')
    return (gl, loc, data) => gl.uniform3fv(loc, new Float32Array(data).subarray(0, 3));
  if (typeName === 'vec4f') return (gl, loc, data) => gl.uniform4fv(loc, new Float32Array(data));
  if (typeName === 'mat2x2f')
    return (gl, loc, data) => gl.uniformMatrix2fv(loc, false, new Float32Array(data));
  if (typeName === 'mat3x3f')
    return (gl, loc, data) => gl.uniformMatrix3fv(loc, false, new Float32Array(data));
  if (typeName === 'mat4x4f')
    return (gl, loc, data) => gl.uniformMatrix4fv(loc, false, new Float32Array(data));
  return () => {};
}

class TgpuWebGLRenderPipelineImpl implements TgpuWebGLRenderPipeline {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #uniformBindings: UniformBinding[];
  #textureBindings: TextureBinding[];
  #colorAttachment: WebGLColorAttachment | null = null;
  #offscreen: OffscreenCanvas;
  #vao: WebGLVertexArrayObject;

  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    crossShaderStageState: CrossShaderStageState,
    uniforms: readonly WebGLUniform[],
    offscreen: OffscreenCanvas,
  ) {
    this.#gl = gl;
    this.#program = program;
    this.#offscreen = offscreen;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.#vao = vao;

    // Query uniform locations once; skip uniforms that weren't actually used by the shaders.
    const bindings: UniformBinding[] = [];
    for (const uniform of uniforms) {
      const name = crossShaderStageState.globalIdentifierMap.get(uniform);
      if (!name) {
        continue; // Not used in the shader
      }

      const location = gl.getUniformLocation(program, name);
      if (location === null) {
        continue; // Not used in the shader
      }

      bindings.push({
        uniform,
        location,
        setter: uniformSetterFor(uniform.dataType),
      });
    }
    this.#uniformBindings = bindings;

    const resourcesByName = new Map(
      [...crossShaderStageState.globalIdentifierMap].map(([resource, name]) => [name, resource]),
    );
    const samplers = [...crossShaderStageState.globalIdentifierMap.keys()].filter(
      (resource): resource is WebGLSamplerImpl => resource instanceof WebGLSamplerImpl,
    );
    this.#textureBindings = [];
    for (const [resource, name] of crossShaderStageState.globalIdentifierMap) {
      if (!(resource instanceof WebGLTextureView)) continue;
      const location = gl.getUniformLocation(program, name);
      if (location === null) continue;
      const samplerName = crossShaderStageState.textureSamplerPairs.get(name);
      const pairedSampler = samplerName ? resourcesByName.get(samplerName) : undefined;
      const sampler = pairedSampler instanceof WebGLSamplerImpl ? pairedSampler : samplers[0];
      const flipName = crossShaderStageState.textureFlipIdentifiers.get(name);
      this.#textureBindings.push({
        view: resource,
        sampler,
        location,
        flipLocation: flipName ? gl.getUniformLocation(program, flipName) : null,
      });
    }
  }

  withColorAttachment(attachment: WebGLColorAttachment): this {
    this.#colorAttachment = attachment;
    return this;
  }

  draw(vertexCount: number, _instanceCount = 1, firstVertex = 0): void {
    const gl = this.#gl;

    const target = this.#colorAttachment?.view;
    if (target && !(target instanceof WebGLTextureRenderView)) {
      const canvas = target.canvas;
      this.#offscreen.width = canvas.width;
      this.#offscreen.height = canvas.height;
    }

    if (target instanceof WebGLTextureRenderView) {
      target.texture.needsYFlipWhenSampling = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.size[0], target.size[1]);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.#offscreen.width, this.#offscreen.height);
    }

    if (this.#colorAttachment?.loadOp !== 'load') {
      const clear = this.#colorAttachment?.clearValue ?? [0, 0, 0, 0];
      const rgba =
        Symbol.iterator in Object(clear)
          ? [...(clear as Iterable<number>)]
          : [
              (clear as GPUColorDict).r,
              (clear as GPUColorDict).g,
              (clear as GPUColorDict).b,
              (clear as GPUColorDict).a,
            ];
      gl.clearColor(rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);

    // Upload current uniform values
    for (const b of this.#uniformBindings) {
      b.setter(gl, b.location, b.uniform.buffer);
    }

    for (let unit = 0; unit < this.#textureBindings.length; unit++) {
      const binding = this.#textureBindings[unit] as TextureBinding;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, binding.view.texture.raw);
      gl.bindSampler(unit, binding.sampler?.raw ?? null);
      gl.uniform1i(binding.location, unit);
      if (binding.flipLocation !== null) {
        gl.uniform1i(binding.flipLocation, binding.view.texture.needsYFlipWhenSampling ? 1 : 0);
      }
    }

    gl.drawArrays(gl.TRIANGLES, firstVertex, vertexCount);

    gl.bindVertexArray(null);

    if (target && !(target instanceof WebGLTextureRenderView)) {
      const canvas = target.canvas as HTMLCanvasElement;
      const bitmapCtx = canvas.getContext('bitmaprenderer');
      if (bitmapCtx) {
        const bitmap = this.#offscreen.transferToImageBitmap();
        bitmapCtx.transferFromImageBitmap(bitmap);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

class WebGLUniformImpl<TData extends d.AnyWgslData> implements WebGLUniform<TData> {
  readonly resourceType = 'uniform' as const;

  readonly #initial: BufferInitialData<TData> | undefined;

  readonly dataType: TData;
  readonly buffer: ArrayBuffer;

  declare readonly $: d.InferGPU<TData>;

  static {
    makeDereferenceable(
      makeResolvable(WebGLUniformImpl.prototype, {
        resolve(ctx) {
          const crossShaderStageState = getCrossShaderStageState(ctx);

          let id = crossShaderStageState.globalIdentifierMap.get(this);
          if (!id) {
            id = ctx.makeUniqueIdentifier(getName(this), 'global');
            crossShaderStageState.globalIdentifierMap.set(this, id);
          }

          return ctx.gen.declareGlobalVar({
            id,
            dataType: this.dataType,
            init: undefined,
            scope: 'uniform',
          });
        },
        asString() {
          return `uniform:${getName(this) ?? '<unnamed>'}`;
        },
      }),
      {
        normalMode: {
          get() {
            throw new Error(
              'Cannot read WebGL uniform outside of shader code. Use `.write()` to update it.',
            );
          },
        },
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(trackingProxy, this.dataType, 'uniform', /* possibleSideEffects */ false);
          },
        },
      },
    );
  }

  constructor(dataType: TData, initial?: BufferInitialData<TData>) {
    this.dataType = dataType;
    this.#initial = initial;
    this.buffer = new ArrayBuffer(d.sizeOf(dataType));

    if (this.#initial !== undefined) {
      const initialData =
        typeof this.#initial === 'function'
          ? (this.#initial as (buffer: this) => d.InferInput<TData>)(this)
          : (this.#initial as d.InferInput<TData>);
      writeToArrayBuffer(this.buffer, this.dataType, initialData);
    }
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  write(data: d.InferInput<TData>, options?: BufferWriteOptions): void {
    writeToArrayBuffer(this.buffer, this.dataType, data, options);
  }

  public patch(data: d.InferPatch<TData>): void {
    patchArrayBuffer(this.buffer, this.dataType, data);
  }

  public clear(): void {
    new Uint8Array(this.buffer).fill(0);
  }

  copyFrom(_srcBuffer: TgpuBuffer<d.MemIdentity<TData>>): void {
    throw new WebGLFallbackUnsupportedError('.copyFrom()');
  }

  read(): Promise<d.Infer<TData>> {
    return Promise.resolve(readFromArrayBuffer(this.buffer, this.dataType));
  }

  destroy() {
    // No-op
  }
}

export class TgpuRootWebGL {
  #gl: WebGL2RenderingContext;
  #offscreen: OffscreenCanvas;
  #uniforms: WebGLUniformImpl<d.AnyWgslData>[] = [];
  #buffers: WebGLBuffer[] = [];
  #textures: WebGLTextureImpl[] = [];
  #samplers: WebGLSamplerImpl[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#offscreen = gl.canvas as OffscreenCanvas;
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
    const fakeRoot = tgpu.initFromDevice({ device: {} as GPUDevice });
    // oxlint-disable-next-line typescript/no-explicit-any
    const fakePipeline = fakeRoot.createRenderPipeline(descriptor as any);

    const crossShaderStageState = new CrossShaderStageState();

    const vertexCode = tgpu.resolve([fakePipeline], {
      unstable_shaderGenerator: new GlslGenerator('vertex', crossShaderStageState),
    });

    const fragmentCode = tgpu.resolve([fakePipeline], {
      unstable_shaderGenerator: new GlslGenerator('fragment', crossShaderStageState),
    });

    const vertexGlsl = GLSL_HEADER + vertexCode;
    const fragmentGlsl = GLSL_HEADER + fragmentCode;

    const program = linkProgram(this.#gl, vertexGlsl, fragmentGlsl);

    return new TgpuWebGLRenderPipelineImpl(
      this.#gl,
      program,
      crossShaderStageState,
      this.#uniforms.slice() as Array<WebGLUniform>,
      this.#offscreen,
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
