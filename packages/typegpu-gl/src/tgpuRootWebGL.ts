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
  type TgpuVertexLayout,
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
  readonly data: ArrayBuffer;
  readonly buffer: { destroy(): void };
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

type TgpuVertexAttrib = { format: GPUVertexFormat; offset: number };

interface UniformBinding {
  uniform: WebGLUniform;
  location: WebGLUniformLocation;
  offset: number;
  size: number;
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
  throw new WebGLFallbackUnsupportedError(`uniform type ${typeName}`);
}

class TgpuWebGLRenderPipelineImpl implements TgpuWebGLRenderPipeline {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #uniformBindings: UniformBinding[];
  #textureBindings: TextureBinding[];
  #colorAttachment: WebGLColorAttachment | null = null;
  #offscreen: OffscreenCanvas;
  #vao: WebGLVertexArrayObject;
  #descriptor: TgpuRenderPipeline.Descriptor;
  #attributes: { layout: TgpuVertexLayout; attrib: TgpuVertexAttrib; location: number }[] = [];
  #vertexBuffers = new Map<TgpuVertexLayout, WebGLVertexBuffer>();
  #indexBuffer: WebGLVertexBuffer | undefined;
  #depthAttachment:
    | { view: WebGLTextureRenderView; depthLoadOp?: GPULoadOp; depthClearValue?: number }
    | undefined;

  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    crossShaderStageState: CrossShaderStageState,
    uniforms: readonly WebGLUniform[],
    offscreen: OffscreenCanvas,
    descriptor: TgpuRenderPipeline.Descriptor,
  ) {
    this.#descriptor = descriptor;
    this.#gl = gl;
    this.#program = program;
    this.#offscreen = offscreen;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.#vao = vao;
    for (const [key, location] of crossShaderStageState.vertexInputLocations) {
      const attribs = descriptor.attribs;
      const attrib = (attribs && 'format' in attribs ? attribs : attribs?.[key]) as
        | (TgpuVertexAttrib & { _layout: TgpuVertexLayout })
        | undefined;
      if (attrib) this.#attributes.push({ layout: attrib._layout, attrib, location });
    }

    // Query uniform locations once; skip uniforms that weren't actually used by the shaders.
    const bindings: UniformBinding[] = [];
    for (const uniform of uniforms) {
      const name = crossShaderStageState.globalIdentifierMap.get(uniform);
      if (!name) {
        continue; // Not used in the shader
      }

      const visit = (schema: d.AnyWgslData, path: string, offset: number) => {
        const inner = (d.isDecorated(schema) ? schema.inner : schema) as d.AnyWgslData;
        if (d.isWgslStruct(inner)) {
          for (const [key, member] of Object.entries(inner.propTypes)) {
            visit(
              member as d.AnyWgslData,
              `${path}.${key}`,
              offset + d.memoryLayoutOf(inner, (v) => v[key]).offset,
            );
          }
        } else if (d.isWgslArray(inner)) {
          for (let i = 0; i < inner.elementCount; i++) {
            visit(
              inner.elementType as d.AnyWgslData,
              `${path}[${i}]`,
              offset + d.memoryLayoutOf(inner, (v) => v[i]).offset,
            );
          }
        } else {
          const location = gl.getUniformLocation(program, path);
          if (location !== null)
            bindings.push({
              uniform,
              location,
              offset,
              size: d.sizeOf(inner),
              setter: uniformSetterFor(inner),
            });
        }
      };
      visit(uniform.dataType, name, 0);
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

  destroy() {
    this.#gl.deleteProgram(this.#program);
    this.#gl.deleteVertexArray(this.#vao);
  }

  withColorAttachment(attachment: WebGLColorAttachment): this {
    this.#colorAttachment = attachment;
    return this;
  }

  with(layout: TgpuVertexLayout, buffer: WebGLVertexBuffer): this {
    this.#vertexBuffers.set(layout, buffer);
    return this;
  }

  withIndexBuffer(buffer: WebGLVertexBuffer): this {
    this.#indexBuffer = buffer;
    return this;
  }

  withDepthStencilAttachment(attachment: {
    view: WebGLTextureRenderView;
    depthLoadOp?: GPULoadOp;
    depthClearValue?: number;
  }): this {
    this.#depthAttachment = attachment;
    return this;
  }

  drawIndexed(
    indexCount: number,
    instanceCount = 1,
    firstIndex = 0,
    baseVertex = 0,
    firstInstance = 0,
  ): void {
    if (baseVertex !== 0 || firstInstance !== 0)
      throw new WebGLFallbackUnsupportedError('baseVertex/firstInstance');
    if (!this.#indexBuffer) throw new Error('Missing index buffer');
    this.#draw(indexCount, instanceCount, firstIndex, true);
  }

  draw(vertexCount: number, instanceCount = 1, firstVertex = 0, firstInstance = 0): void {
    if (firstInstance !== 0) throw new WebGLFallbackUnsupportedError('firstInstance');
    this.#draw(vertexCount, instanceCount, firstVertex, false);
  }

  #draw(vertexCount: number, instanceCount: number, firstVertex: number, indexed: boolean): void {
    const gl = this.#gl;

    const target = this.#colorAttachment?.view;
    if (target && !(target instanceof WebGLTextureRenderView)) {
      const canvas = target.canvas;
      if (this.#offscreen.width !== canvas.width) this.#offscreen.width = canvas.width;
      if (this.#offscreen.height !== canvas.height) this.#offscreen.height = canvas.height;
    }

    if (target instanceof WebGLTextureRenderView) {
      target.texture.needsYFlipWhenSampling = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.size[0], target.size[1]);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.#offscreen.width, this.#offscreen.height);
    }

    const depth = this.#depthAttachment;
    if (target instanceof WebGLTextureRenderView) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        depth?.view.texture.raw ?? null,
        0,
      );
    }
    if (depth && this.#descriptor.depthStencil) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      if (depth.depthLoadOp !== 'load') {
        gl.clearDepth(depth.depthClearValue ?? 1);
        gl.clear(gl.DEPTH_BUFFER_BIT);
      }
      gl.depthMask(this.#descriptor.depthStencil.depthWriteEnabled ?? false);
      const comparisons = {
        never: gl.NEVER,
        less: gl.LESS,
        equal: gl.EQUAL,
        'less-equal': gl.LEQUAL,
        greater: gl.GREATER,
        'not-equal': gl.NOTEQUAL,
        'greater-equal': gl.GEQUAL,
        always: gl.ALWAYS,
      };
      gl.depthFunc(comparisons[this.#descriptor.depthStencil.depthCompare ?? 'always']);
    } else {
      gl.disable(gl.DEPTH_TEST);
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
      b.setter(gl, b.location, b.uniform.data.slice(b.offset, b.offset + b.size));
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

    for (const { layout, attrib, location } of this.#attributes) {
      const buffer = this.#vertexBuffers.get(layout);
      if (!buffer) throw new Error('Missing vertex buffer');
      if (!/^float32(x[234])?$/.test(attrib.format))
        throw new WebGLFallbackUnsupportedError(`vertex format ${attrib.format}`);
      buffer.upload(gl.ARRAY_BUFFER);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(
        location,
        Number(attrib.format.split('x')[1] ?? 1),
        gl.FLOAT,
        false,
        layout.stride,
        attrib.offset,
      );
      gl.vertexAttribDivisor(location, layout.stepMode === 'instance' ? 1 : 0);
    }
    if (indexed) {
      const buffer = this.#indexBuffer as WebGLVertexBuffer;
      buffer.upload(gl.ELEMENT_ARRAY_BUFFER);
      const size = d.sizeOf((buffer.dataType as d.WgslArray).elementType as d.AnyData);
      if (size !== 2 && size !== 4) throw new WebGLFallbackUnsupportedError('index format');
      gl.drawElementsInstanced(
        gl.TRIANGLES,
        vertexCount,
        size === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
        firstVertex * size,
        instanceCount,
      );
    } else if (instanceCount !== 1) {
      gl.drawArraysInstanced(gl.TRIANGLES, firstVertex, vertexCount, instanceCount);
    } else {
      gl.drawArrays(gl.TRIANGLES, firstVertex, vertexCount);
    }

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

class WebGLVertexBuffer {
  readonly resourceType = 'buffer';
  get arrayBuffer() {
    return this.data;
  }
  readonly data: ArrayBuffer;
  readonly raw: WebGLBuffer;
  private dirty = true;
  private destroyed = false;

  readonly gl: WebGL2RenderingContext;
  readonly dataType: d.AnyData;
  constructor(gl: WebGL2RenderingContext, dataType: d.AnyData, initial?: unknown) {
    this.gl = gl;
    this.dataType = dataType;
    this.data = new ArrayBuffer(d.sizeOf(dataType));
    const raw = gl.createBuffer();
    if (!raw) throw new Error('Failed to create WebGL buffer');
    this.raw = raw;
    if (typeof initial === 'function') initial(this);
    else if (initial !== undefined) this.write(initial);
  }

  $usage(...usages: string[]) {
    if (usages.some((usage) => usage !== 'vertex' && usage !== 'index'))
      throw new WebGLFallbackUnsupportedError('buffer usage');
    return this;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }
  write(data: unknown, options?: BufferWriteOptions) {
    writeToArrayBuffer(this.data, this.dataType, data, options);
    this.dirty = true;
  }
  upload(target: number) {
    if (this.destroyed) throw new Error('Buffer is destroyed');
    this.gl.bindBuffer(target, this.raw);
    if (this.dirty) {
      this.gl.bufferData(target, this.data, this.gl.DYNAMIC_DRAW);
      this.dirty = false;
    }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gl.deleteBuffer(this.raw);
  }
}

class WebGLUniformImpl<TData extends d.AnyWgslData> implements WebGLUniform<TData> {
  readonly resourceType = 'uniform' as const;

  readonly #initial: BufferInitialData<TData> | undefined;

  readonly dataType: TData;
  readonly data: ArrayBuffer;
  get buffer() {
    return this;
  }

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
    this.data = new ArrayBuffer(d.sizeOf(dataType));

    if (this.#initial !== undefined) {
      const initialData =
        typeof this.#initial === 'function'
          ? (this.#initial as (buffer: this) => d.InferInput<TData>)(this)
          : (this.#initial as d.InferInput<TData>);
      writeToArrayBuffer(this.data, this.dataType, initialData);
    }
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  write(data: d.InferInput<TData>, options?: BufferWriteOptions): void {
    writeToArrayBuffer(this.data, this.dataType, data, options);
  }

  public patch(data: d.InferPatch<TData>): void {
    patchArrayBuffer(this.data, this.dataType, data);
  }

  public clear(): void {
    new Uint8Array(this.data).fill(0);
  }

  copyFrom(_srcBuffer: TgpuBuffer<d.MemIdentity<TData>>): void {
    throw new WebGLFallbackUnsupportedError('.copyFrom()');
  }

  read(): Promise<d.Infer<TData>> {
    return Promise.resolve(readFromArrayBuffer(this.data, this.dataType));
  }

  destroy() {
    // No-op
  }
}

export class TgpuRootWebGL {
  #gl: WebGL2RenderingContext;
  #offscreen: OffscreenCanvas;
  #uniforms: WebGLUniformImpl<d.AnyWgslData>[] = [];
  #buffers: WebGLVertexBuffer[] = [];
  #pipelines: TgpuWebGLRenderPipelineImpl[] = [];
  #textures: WebGLTextureImpl[] = [];
  #samplers: WebGLSamplerImpl[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#offscreen = gl.canvas as OffscreenCanvas;
  }

  createBuffer(schema: d.AnyData, initial?: unknown): WebGLVertexBuffer {
    const buffer = new WebGLVertexBuffer(this.#gl, schema, initial);
    this.#buffers.push(buffer);
    return buffer;
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

    const pipeline = new TgpuWebGLRenderPipelineImpl(
      this.#gl,
      program,
      crossShaderStageState,
      this.#uniforms.slice() as Array<WebGLUniform>,
      this.#offscreen,
      descriptor,
    );
    this.#pipelines.push(pipeline);
    return pipeline;
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
      buf.destroy();
    }
    this.#buffers = [];
    for (const pipeline of this.#pipelines) pipeline.destroy();
    this.#pipelines = [];
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
