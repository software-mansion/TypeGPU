import { d, tgpu, type TgpuRenderPipeline, type TgpuVertexLayout } from 'typegpu';
import { getName } from 'typegpu/~internal';

import { WebGLFallbackUnsupportedError } from './errors.ts';
import {
  applyDepthStencilState,
  applyPrimitiveAndTargetState,
  glColorTargetState,
  glDepthStencilState,
  glPrimitiveState,
  type ColorTargetState,
  type GLColorTargetState,
  type GLDepthStencilState,
  type GLPrimitiveState,
} from './glState.ts';
import { CrossShaderStageState, GlslGenerator } from './glslGenerator.ts';
import type { CanvasPresenter } from './presenter.ts';
import type { DepthTarget, RenderTargets } from './renderTargets.ts';
import type { VertexArrays, VertexAttribute } from './vertexArrays.ts';
import { vertexFormatInfo, type VertexFormat } from './vertexFormats.ts';
import { WebGLBufferImpl } from './webglBuffer.ts';
import {
  WebGLSamplerImpl,
  WebGLTextureImpl,
  WebGLTextureRenderView,
  WebGLTextureView,
} from './webglTexture.ts';
import { planUniformUploads, WebGLUniformImpl, type UniformUpload } from './webglUniform.ts';

// ----------
// Public API
// ----------

export interface WebGLRenderContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly alphaMode?: string | undefined;
}

export interface WebGLColorAttachment {
  view: WebGLRenderContext | WebGLTextureRenderView | WebGLTextureImpl;
  resolveTarget?: unknown;
  loadOp?: GPULoadOp;
  storeOp?: GPUStoreOp;
  clearValue?: GPUColor;
}

export interface WebGLDepthStencilAttachment {
  /**
   * A depth texture (or its render view) created by the WebGL root. Anything else makes
   * the fallback use an implicit depth buffer that belongs to the color target: the
   * canvas' own depth buffer, or a renderbuffer created for the target texture.
   */
  view: unknown;
  depthClearValue?: number;
  depthLoadOp?: GPULoadOp;
  depthStoreOp?: GPUStoreOp;
  depthReadOnly?: boolean;
  stencilClearValue?: GPUStencilValue;
  stencilLoadOp?: GPULoadOp;
  stencilStoreOp?: GPUStoreOp;
  stencilReadOnly?: boolean;
}

/**
 * Like the WebGPU render pipeline, every `with*` method returns a new pipeline, leaving
 * the original untouched. Derived pipelines share the compiled program and bindings.
 */
export interface TgpuWebGLRenderPipeline {
  withColorAttachment(
    attachment: WebGLColorAttachment | Record<string, WebGLColorAttachment>,
  ): this;
  withDepthStencilAttachment(attachment: WebGLDepthStencilAttachment): this;
  withStencilReference(reference: GPUStencilValue): this;
  /**
   * Binds a vertex buffer to a vertex layout used by the pipeline's attributes.
   * Other overloads of `with` (bind groups, immediates, passes, encoders) are not
   * supported by the fallback.
   */
  with(vertexLayout: TgpuVertexLayout, buffer: unknown): this;
  /**
   * Like in the WebGPU root, a buffer with an array of `u16` or `u32` elements, with the
   * offset and size in elements, or any index buffer together with its index format,
   * with the offset and size in bytes.
   */
  withIndexBuffer(buffer: unknown, offsetElements?: number, sizeElements?: number): this;
  withIndexBuffer(
    buffer: unknown,
    indexFormat: GPUIndexFormat,
    offsetBytes?: number,
    sizeBytes?: number,
  ): this;
  readonly hasIndexBuffer: boolean;
  pipe<T>(transform: (pipeline: this) => T): T;
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void;
  drawIndirect(): never;
  drawIndexedIndirect(): never;
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
  readonly uniform: WebGLUniformImpl<d.AnyWgslData>;
  readonly uploads: readonly UniformUpload[];
  /**
   * The version of the uniform's buffer that was last uploaded. Programs keep their
   * uniform values, so they're only uploaded again when they change.
   */
  uploadedVersion: number | undefined;
}

interface TextureBinding {
  view: WebGLTextureView;
  sampler: WebGLSamplerImpl | undefined;
  location: WebGLUniformLocation;
  flipLocation: WebGLUniformLocation | null;
}

/**
 * Everything derived from the pipeline descriptor. Shared by all pipelines derived
 * with `with*` methods, and never mutated.
 */
interface PipelineCore {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  /** Identifies the pipeline's attribute setup in the VAO cache */
  readonly id: number;
  readonly attributes: readonly VertexAttribute[];
  readonly vertexArrays: VertexArrays;
  readonly offscreen: OffscreenCanvas;
  readonly presenter: CanvasPresenter;
  readonly uniformBindings: readonly UniformBinding[];
  readonly textureBindings: readonly TextureBinding[];
  readonly renderTargets: RenderTargets;
  readonly primitive: GLPrimitiveState;
  /** Ordered by location. Empty when there's no fragment shader. */
  readonly colorOutputs: readonly ColorOutput[];
  /** Set when the color outputs differ in blend state or write mask */
  readonly drawBuffersIndexed: OES_draw_buffers_indexed | undefined;
  readonly depthStencil: GLDepthStencilState | undefined;
}

interface ColorOutput {
  /** The name of the fragment output, `undefined` when it returns a single value */
  readonly name: string | undefined;
  /** The fragment output's location, which is also its draw buffer's index */
  readonly location: number;
  readonly target: GLColorTargetState;
}

interface IndexBufferBinding {
  readonly buffer: WebGLBufferImpl<d.AnyData>;
  readonly format: GPUIndexFormat;
  readonly offsetBytes: number;
  /** `undefined` means up to the end of the buffer */
  readonly sizeBytes: number | undefined;
}

/**
 * What the `with*` methods set. Every derived pipeline has its own.
 */
interface PipelineState {
  readonly vertexBuffers: ReadonlyMap<TgpuVertexLayout, WebGLBufferImpl<d.AnyData>>;
  readonly indexBuffer: IndexBufferBinding | undefined;
  readonly colorAttachment: WebGLColorAttachment | Record<string, WebGLColorAttachment> | undefined;
  readonly depthStencilAttachment: WebGLDepthStencilAttachment | undefined;
  readonly stencilReference: number;
}

export interface WebGLRenderPipelineOptions {
  readonly gl: WebGL2RenderingContext;
  readonly offscreen: OffscreenCanvas;
  readonly presenter: CanvasPresenter;
  readonly renderTargets: RenderTargets;
  readonly vertexArrays: VertexArrays;
  readonly descriptor: TgpuRenderPipeline.Descriptor;
}

function getColorOutputs(
  gl: WebGL2RenderingContext,
  descriptor: TgpuRenderPipeline.Descriptor,
  fragmentOutputs: ReadonlyMap<string, number>,
): ColorOutput[] {
  if (!descriptor.fragment) {
    return [];
  }
  if (fragmentOutputs.size === 0) {
    const target = descriptor.targets as ColorTargetState;
    return [{ name: undefined, location: 0, target: glColorTargetState(gl, target) }];
  }
  // Like in WebGPU, the targets of struct outputs are matched by name
  const targets = (descriptor.targets ?? {}) as Record<string, ColorTargetState>;
  return [...fragmentOutputs]
    .map(([name, location]) => ({ name, location, target: glColorTargetState(gl, targets[name]) }))
    .toSorted((a, b) => a.location - b.location);
}

function haveSameState(a: GLColorTargetState, b: GLColorTargetState): boolean {
  return (
    a.colorMask.every((value, i) => value === b.colorMask[i]) &&
    (a.blend === b.blend ||
      (a.blend !== undefined &&
        b.blend !== undefined &&
        (Object.keys(a.blend) as (keyof typeof a.blend)[]).every(
          (key) => a.blend?.[key] === b.blend?.[key],
        )))
  );
}

/** A vertex attribute, as it's found in `layout.attrib` */
interface TgpuVertexAttribute {
  readonly format: VertexFormat;
  readonly offset: number;
  readonly _layout: TgpuVertexLayout;
}

function isVertexAttribute(value: unknown): value is TgpuVertexAttribute {
  return typeof (value as TgpuVertexAttribute | undefined)?.format === 'string';
}

/**
 * Entries of the pipeline's `attribs`. A single attribute applies to the only
 * vertex input, which is marked with `'*'`.
 */
function attribEntries(
  attribs: TgpuVertexAttribute | Record<string, TgpuVertexAttribute> | undefined,
): [string, TgpuVertexAttribute][] {
  if (!attribs) return [];
  return isVertexAttribute(attribs) ? [['*', attribs]] : Object.entries(attribs);
}

// WebGL 2 limits strides to 255 bytes, while WebGPU allows up to 2048
const MAX_VERTEX_STRIDE = 255;

function collectAttributes(
  attribs: TgpuVertexAttribute | Record<string, TgpuVertexAttribute> | undefined,
  crossShaderStageState: CrossShaderStageState,
): VertexAttribute[] {
  const attributes: VertexAttribute[] = [];
  for (const [prop, input] of crossShaderStageState.vertexInputs) {
    const attrib = isVertexAttribute(attribs) ? attribs : attribs?.[prop];
    if (!attrib) {
      throw new Error(`An attribute by the name of '${prop}' was not provided to the shader.`);
    }

    const format = vertexFormatInfo[attrib.format];
    const readsIntegers = ['i32', 'u32'].includes(
      (input.dataType as { primitive?: d.BaseData }).primitive?.type ?? input.dataType.type,
    );
    if (format.integer !== readsIntegers) {
      throw new Error(
        `Vertex attribute '${prop}' of format '${attrib.format}' cannot be read as '${input.dataType.type}'.`,
      );
    }

    const layout = attrib._layout;
    if (layout.stride > MAX_VERTEX_STRIDE) {
      throw new WebGLFallbackUnsupportedError(
        `vertex layouts with a stride of ${layout.stride} bytes`,
        `WebGL 2 allows at most ${MAX_VERTEX_STRIDE}`,
      );
    }

    attributes.push({ location: input.location, layout, offset: attrib.offset, format });
  }
  return attributes;
}

let nextPipelineId = 0;

export function createWebGLRenderPipeline(
  options: WebGLRenderPipelineOptions,
): TgpuWebGLRenderPipeline {
  const { gl, descriptor } = options;

  // Validating the descriptor before compiling anything
  const primitive = glPrimitiveState(gl, descriptor.primitive);
  const depthStencil = descriptor.depthStencil
    ? glDepthStencilState(gl, descriptor.depthStencil)
    : undefined;
  if ((descriptor.multisample?.count ?? 1) > 1) {
    throw new WebGLFallbackUnsupportedError(
      'multisampled pipelines',
      'multisampled textures are not supported, but the default framebuffer is antialiased by the browser',
    );
  }

  // Reusing the WebGPU pipeline's resolution logic (IO schemas, varying locations, ...),
  // only swapping out the shader generator.
  const fakeRoot = tgpu.initFromDevice({ device: {} as GPUDevice });
  // oxlint-disable-next-line typescript/no-explicit-any
  const fakePipeline = fakeRoot.createRenderPipeline(descriptor as any);

  const crossShaderStageState = new CrossShaderStageState();

  const attribs = descriptor.attribs as
    | TgpuVertexAttribute
    | Record<string, TgpuVertexAttribute>
    | undefined;
  for (const [prop, attrib] of attribEntries(attribs)) {
    const swizzle = vertexFormatInfo[attrib.format].swizzle;
    if (swizzle) {
      crossShaderStageState.vertexInputSwizzles.set(prop, swizzle);
    }
  }

  const vertexCode = tgpu.resolve([fakePipeline], {
    unstable_shaderGenerator: new GlslGenerator('vertex', crossShaderStageState),
  });

  const fragmentCode = tgpu.resolve([fakePipeline], {
    unstable_shaderGenerator: new GlslGenerator('fragment', crossShaderStageState),
  });

  const attributes = collectAttributes(attribs, crossShaderStageState);
  const colorOutputs = getColorOutputs(gl, descriptor, crossShaderStageState.fragmentOutputs);
  let drawBuffersIndexed: OES_draw_buffers_indexed | undefined;
  const [firstOutput, ...otherOutputs] = colorOutputs;
  if (
    firstOutput &&
    otherOutputs.some((output) => !haveSameState(firstOutput.target, output.target))
  ) {
    // Core WebGL 2 has one blend state and write mask shared by all draw buffers
    drawBuffersIndexed = gl.getExtension('OES_draw_buffers_indexed') ?? undefined;
    if (!drawBuffersIndexed) {
      throw new WebGLFallbackUnsupportedError(
        'color targets with different blend states or write masks',
        'requires the OES_draw_buffers_indexed extension, which this browser does not provide',
      );
    }
  }

  const program = linkProgram(gl, GLSL_HEADER + vertexCode, GLSL_HEADER + fragmentCode);

  // Query uniform locations once, for every uniform the shaders use
  const uniformBindings: UniformBinding[] = [];
  for (const [uniform, name] of crossShaderStageState.globalIdentifierMap) {
    if (!(uniform instanceof WebGLUniformImpl)) {
      continue;
    }

    const uploads = planUniformUploads(gl, program, name, uniform.dataType);
    if (uploads.length > 0) {
      uniformBindings.push({ uniform, uploads, uploadedVersion: undefined });
    }
  }

  const resourcesByName = new Map(
    [...crossShaderStageState.globalIdentifierMap].map(([resource, name]) => [name, resource]),
  );
  const samplers = [...crossShaderStageState.globalIdentifierMap.keys()].filter(
    (resource): resource is WebGLSamplerImpl => resource instanceof WebGLSamplerImpl,
  );
  const textureBindings: TextureBinding[] = [];
  for (const [resource, name] of crossShaderStageState.globalIdentifierMap) {
    if (!(resource instanceof WebGLTextureView)) continue;
    const location = gl.getUniformLocation(program, name);
    if (location === null) continue;
    const samplerName = crossShaderStageState.textureSamplerPairs.get(name);
    const pairedSampler = samplerName ? resourcesByName.get(samplerName) : undefined;
    const sampler = pairedSampler instanceof WebGLSamplerImpl ? pairedSampler : samplers[0];
    const flipName = crossShaderStageState.textureFlipIdentifiers.get(name);
    textureBindings.push({
      view: resource,
      sampler,
      location,
      flipLocation: flipName ? gl.getUniformLocation(program, flipName) : null,
    });
  }

  const core: PipelineCore = {
    gl,
    program,
    id: nextPipelineId++,
    attributes,
    vertexArrays: options.vertexArrays,
    offscreen: options.offscreen,
    presenter: options.presenter,
    uniformBindings,
    textureBindings,
    renderTargets: options.renderTargets,
    primitive,
    colorOutputs,
    drawBuffersIndexed,
    depthStencil,
  };

  return new TgpuWebGLRenderPipelineImpl(core, {
    vertexBuffers: new Map(),
    indexBuffer: undefined,
    colorAttachment: undefined,
    depthStencilAttachment: undefined,
    stencilReference: 0,
  });
}

/** WEBGL_draw_instanced_base_vertex_base_instance, which isn't in TypeScript's DOM types */
interface BaseVertexBaseInstanceExtension {
  drawArraysInstancedBaseInstanceWEBGL(
    mode: number,
    first: number,
    count: number,
    instanceCount: number,
    baseInstance: number,
  ): void;
  drawElementsInstancedBaseVertexBaseInstanceWEBGL(
    mode: number,
    count: number,
    type: number,
    offset: number,
    instanceCount: number,
    baseVertex: number,
    baseInstance: number,
  ): void;
}

const baseVertexBaseInstanceExtensions = new WeakMap<
  WebGL2RenderingContext,
  BaseVertexBaseInstanceExtension | null
>();

/**
 * Drawing with a non-zero `baseVertex` or `firstInstance` isn't possible in core
 * WebGL 2, only through this extension, which some browsers provide.
 */
function getBaseVertexBaseInstance(
  gl: WebGL2RenderingContext,
  operation: string,
): BaseVertexBaseInstanceExtension {
  let extension = baseVertexBaseInstanceExtensions.get(gl);
  if (extension === undefined) {
    extension = gl.getExtension(
      'WEBGL_draw_instanced_base_vertex_base_instance',
    ) as BaseVertexBaseInstanceExtension | null;
    baseVertexBaseInstanceExtensions.set(gl, extension);
  }
  if (!extension) {
    throw new WebGLFallbackUnsupportedError(
      operation,
      'requires the WEBGL_draw_instanced_base_vertex_base_instance extension, which this browser does not provide',
    );
  }
  return extension;
}

function toRGBA(color: GPUColor): [number, number, number, number] {
  const [r = 0, g = 0, b = 0, a = 0] =
    Symbol.iterator in Object(color)
      ? [...(color as Iterable<number>)]
      : [
          (color as GPUColorDict).r,
          (color as GPUColorDict).g,
          (color as GPUColorDict).b,
          (color as GPUColorDict).a,
        ];
  return [r, g, b, a];
}

function resolveColorView(
  view: WebGLColorAttachment['view'],
): WebGLTextureRenderView | WebGLRenderContext {
  return view instanceof WebGLTextureImpl ? view.renderView : view;
}

function isColorAttachment(value: unknown): value is WebGLColorAttachment {
  return !!(value as WebGLColorAttachment | undefined)?.view;
}

/**
 * Pairs the pipeline's color outputs with the provided attachments, the same way the
 * WebGPU root does (by name for struct outputs).
 */
function matchColorAttachments(
  outputs: readonly ColorOutput[],
  attachment: PipelineState['colorAttachment'],
): (WebGLColorAttachment | undefined)[] {
  if (attachment === undefined) {
    return outputs.map(() => undefined);
  }
  return outputs.map((output) => {
    if (output.name === undefined) {
      if (!isColorAttachment(attachment)) {
        throw new Error('Expected a single color attachment, not a record.');
      }
      return attachment;
    }
    const matching = (attachment as Record<string, WebGLColorAttachment>)[output.name];
    if (!matching) {
      throw new Error(
        `A color attachment by the name of '${output.name}' was not provided to the shader.`,
      );
    }
    return matching;
  });
}

function resolveDepthTarget(view: unknown): DepthTarget {
  const renderView =
    view instanceof WebGLTextureImpl
      ? view.renderView
      : view instanceof WebGLTextureRenderView
        ? view
        : undefined;
  if (renderView?.texture.format.aspect === 'color') {
    throw new Error(
      `Texture of format '${renderView.texture.props.format}' cannot be used as a depth-stencil attachment.`,
    );
  }
  return renderView ?? 'implicit';
}

/**
 * The default framebuffer only has depth and stencil buffers if the context was created
 * with them, and nothing can be attached to it.
 */
function assertCanvasAspects(
  gl: WebGL2RenderingContext,
  needsDepth: boolean,
  needsStencil: boolean,
) {
  const attributes = gl.getContextAttributes();
  if (needsDepth && attributes?.depth === false) {
    throw new Error(
      'Cannot use a depth attachment when rendering to a canvas, because the WebGL 2 context was created with { depth: false }.',
    );
  }
  if (needsStencil && !attributes?.stencil) {
    throw new Error(
      'Cannot use stencil operations when rendering to a canvas, because the WebGL 2 context was created without { stencil: true }.',
    );
  }
}

class TgpuWebGLRenderPipelineImpl implements TgpuWebGLRenderPipeline {
  readonly #core: PipelineCore;
  readonly #state: PipelineState;

  constructor(core: PipelineCore, state: PipelineState) {
    this.#core = core;
    this.#state = state;
  }

  #with(patch: Partial<PipelineState>): this {
    return new TgpuWebGLRenderPipelineImpl(this.#core, { ...this.#state, ...patch }) as this;
  }

  withColorAttachment(
    attachment: WebGLColorAttachment | Record<string, WebGLColorAttachment>,
  ): this {
    const attachments = isColorAttachment(attachment) ? [attachment] : Object.values(attachment);
    if (attachments.some((a) => a.resolveTarget !== undefined)) {
      throw new WebGLFallbackUnsupportedError(
        'resolveTarget',
        'multisampled textures are not supported, but the canvas is antialiased by the browser',
      );
    }
    return this.#with({ colorAttachment: attachment });
  }

  withDepthStencilAttachment(attachment: WebGLDepthStencilAttachment): this {
    return this.#with({ depthStencilAttachment: attachment });
  }

  withStencilReference(reference: GPUStencilValue): this {
    return this.#with({ stencilReference: reference });
  }

  with(first: unknown, second?: unknown): this {
    const resourceType = (first as { resourceType?: string } | undefined)?.resourceType;
    if (resourceType !== 'vertex-layout') {
      throw new WebGLFallbackUnsupportedError(
        `pipeline.with(${resourceType ?? typeof first})`,
        'only vertex layouts can be bound with .with()',
      );
    }
    if (!(second instanceof WebGLBufferImpl)) {
      throw new Error('Expected a vertex buffer created by the WebGL root.');
    }
    const vertexBuffers = new Map(this.#state.vertexBuffers);
    vertexBuffers.set(first as TgpuVertexLayout, second);
    return this.#with({ vertexBuffers });
  }

  withIndexBuffer(
    buffer: unknown,
    indexFormatOrOffset?: GPUIndexFormat | number,
    offsetOrSize?: number,
    sizeBytes?: number,
  ): this {
    if (typeof GPUBuffer !== 'undefined' && buffer instanceof GPUBuffer) {
      throw new WebGLFallbackUnsupportedError('GPUBuffer index buffers');
    }
    if (!(buffer instanceof WebGLBufferImpl)) {
      throw new Error('Expected an index buffer created by the WebGL root.');
    }

    if (typeof indexFormatOrOffset === 'string') {
      return this.#with({
        indexBuffer: {
          buffer,
          format: indexFormatOrOffset,
          offsetBytes: offsetOrSize ?? 0,
          sizeBytes,
        },
      });
    }

    const elementType = d.isWgslArray(buffer.dataType) ? buffer.dataType.elementType : undefined;
    if (elementType?.type !== 'u16' && elementType?.type !== 'u32') {
      throw new Error(
        'Index buffers must hold an array of u16 or u32 elements, or be passed with an index format.',
      );
    }
    const bytesPerIndex = elementType.type === 'u16' ? 2 : 4;
    return this.#with({
      indexBuffer: {
        buffer,
        format: elementType.type === 'u16' ? 'uint16' : 'uint32',
        offsetBytes: (indexFormatOrOffset ?? 0) * bytesPerIndex,
        sizeBytes: offsetOrSize === undefined ? undefined : offsetOrSize * bytesPerIndex,
      },
    });
  }

  get hasIndexBuffer(): boolean {
    return this.#state.indexBuffer !== undefined;
  }

  pipe<T>(transform: (pipeline: this) => T): T {
    return transform(this);
  }

  /**
   * Uploads the data of the bound buffers, and returns the VAO to draw with.
   */
  #prepareVertexArray(): WebGLVertexArrayObject {
    const { gl, attributes, vertexArrays, id } = this.#core;
    const { vertexBuffers, indexBuffer } = this.#state;

    // Uploading index data binds to the VAO, so it's done without one bound
    gl.bindVertexArray(null);
    for (const { layout } of attributes) {
      const buffer = vertexBuffers.get(layout);
      if (!buffer) {
        throw new Error(
          `Missing vertex buffer for layout '${getName(layout) ?? '<unnamed>'}'. Bind one with pipeline.with(layout, buffer).`,
        );
      }
      if (!buffer.usableAsVertex) {
        throw new Error("Buffer is not usable as a vertex buffer. Add .$usage('vertex').");
      }
      buffer.sync();
    }
    if (indexBuffer) {
      if (!indexBuffer.buffer.usableAsIndex) {
        throw new Error("Buffer is not usable as an index buffer. Add .$usage('index').");
      }
      indexBuffer.buffer.sync();
    }

    return vertexArrays.vertexArrayFor(
      id,
      attributes,
      vertexBuffers as ReadonlyMap<TgpuVertexLayout, WebGLBufferImpl<never>>,
      indexBuffer?.buffer as WebGLBufferImpl<never> | undefined,
    );
  }

  draw(vertexCount: number, instanceCount = 1, firstVertex = 0, firstInstance = 0): void {
    const { gl, primitive } = this.#core;
    const extension =
      firstInstance !== 0 ? getBaseVertexBaseInstance(gl, 'draw() with firstInstance') : undefined;

    const endPass = this.#beginPass();
    if (extension) {
      extension.drawArraysInstancedBaseInstanceWEBGL(
        primitive.mode,
        firstVertex,
        vertexCount,
        instanceCount,
        firstInstance,
      );
    } else {
      gl.drawArraysInstanced(primitive.mode, firstVertex, vertexCount, instanceCount);
    }
    endPass();
  }

  drawIndexed(
    indexCount: number,
    instanceCount = 1,
    firstIndex = 0,
    baseVertex = 0,
    firstInstance = 0,
  ): void {
    const { gl, primitive } = this.#core;
    const indexBuffer = this.#state.indexBuffer;
    if (!indexBuffer) {
      throw new Error(
        'No index buffer is set. Call pipeline.withIndexBuffer before drawing indexed geometry.',
      );
    }
    const extension =
      baseVertex !== 0 || firstInstance !== 0
        ? getBaseVertexBaseInstance(gl, 'drawIndexed() with baseVertex or firstInstance')
        : undefined;

    const bytesPerIndex = indexBuffer.format === 'uint16' ? 2 : 4;
    const availableBytes =
      indexBuffer.sizeBytes ?? indexBuffer.buffer.arrayBuffer.byteLength - indexBuffer.offsetBytes;
    if ((firstIndex + indexCount) * bytesPerIndex > availableBytes) {
      throw new Error(
        `Drawing indices ${firstIndex}..${firstIndex + indexCount} is out of bounds of the index buffer.`,
      );
    }

    const type = indexBuffer.format === 'uint16' ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
    const offset = indexBuffer.offsetBytes + firstIndex * bytesPerIndex;

    const endPass = this.#beginPass();
    if (extension) {
      extension.drawElementsInstancedBaseVertexBaseInstanceWEBGL(
        primitive.mode,
        indexCount,
        type,
        offset,
        instanceCount,
        baseVertex,
        firstInstance,
      );
    } else {
      gl.drawElementsInstanced(primitive.mode, indexCount, type, offset, instanceCount);
    }
    endPass();
  }

  drawIndirect(): never {
    throw new WebGLFallbackUnsupportedError('drawIndirect', 'WebGL 2 has no indirect draws');
  }

  drawIndexedIndirect(): never {
    throw new WebGLFallbackUnsupportedError('drawIndexedIndirect', 'WebGL 2 has no indirect draws');
  }

  /**
   * Binds the attachments, performs their load operations, and sets up all the state
   * needed to draw with this pipeline.
   *
   * @returns A function to call after drawing.
   */
  #beginPass(): () => void {
    const { gl, presenter, offscreen, primitive, depthStencil, colorOutputs } = this.#core;
    const { depthStencilAttachment } = this.#state;

    const attachments = matchColorAttachments(colorOutputs, this.#state.colorAttachment);
    const views = attachments.map((attachment) =>
      attachment ? resolveColorView(attachment.view) : undefined,
    );
    const depthTarget = depthStencilAttachment
      ? resolveDepthTarget(depthStencilAttachment.view)
      : undefined;

    if (depthStencil && !depthStencilAttachment) {
      throw new Error(
        'The pipeline was created with depthStencil state, so it requires a depth-stencil attachment. See withDepthStencilAttachment().',
      );
    }

    const canvasTarget = views.find(
      (view): view is WebGLRenderContext =>
        view !== undefined && !(view instanceof WebGLTextureRenderView),
    );
    const firstTextureView = views.find(
      (view): view is WebGLTextureRenderView => view instanceof WebGLTextureRenderView,
    );
    const depthTexture = depthTarget instanceof WebGLTextureRenderView ? depthTarget : undefined;

    if (canvasTarget || (!firstTextureView && !depthTexture)) {
      // Rendering into a canvas, or into nothing at all, which the fallback has always
      // done with the default framebuffer as well.
      if (views.length > 1) {
        throw new WebGLFallbackUnsupportedError(
          'rendering into a canvas and other color attachments at once',
        );
      }
      if (canvasTarget && colorOutputs[0]?.location !== 0) {
        throw new WebGLFallbackUnsupportedError(
          `rendering into a canvas from a fragment output at location ${colorOutputs[0]?.location}`,
        );
      }
      if (canvasTarget) {
        presenter.beginDraw(canvasTarget.canvas);
      }
      // A depth texture can't be attached to the canvas, so the canvas' own depth
      // buffer is used in its place. It is not written into the texture.
      assertCanvasAspects(
        gl,
        depthStencilAttachment !== undefined,
        depthStencilAttachment?.stencilLoadOp === 'clear' || depthStencil?.stencil !== undefined,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, offscreen.width, offscreen.height);
    } else {
      // Indexed by location, which is also the index of the draw buffer
      const colorsByLocation: (WebGLTextureRenderView | null)[] = [];
      colorOutputs.forEach((output, i) => {
        const view = views[i] as WebGLTextureRenderView | undefined;
        colorsByLocation[output.location] = view ?? null;
        if (view) view.texture.needsYFlipWhenSampling = true;
      });
      for (let i = 0; i < colorsByLocation.length; i++) {
        colorsByLocation[i] ??= null;
      }
      if (depthTexture) {
        depthTexture.texture.needsYFlipWhenSampling = true;
      }
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        this.#core.renderTargets.framebufferFor(colorsByLocation, depthTarget),
      );
      const [width, height] = (firstTextureView ?? (depthTexture as WebGLTextureRenderView)).size;
      gl.viewport(0, 0, width, height);
    }

    // Unlike WebGPU's clears, GL's are affected by write masks and the scissor test
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    let clearMask = 0;
    if (colorOutputs.length <= 1) {
      const attachment = attachments[0];
      if (attachment?.loadOp !== 'load') {
        gl.clearColor(...toRGBA(attachment?.clearValue ?? [0, 0, 0, 0]));
        clearMask |= gl.COLOR_BUFFER_BIT;
      }
    } else {
      colorOutputs.forEach((output, i) => {
        const attachment = attachments[i];
        if (attachment && attachment.loadOp !== 'load') {
          gl.clearBufferfv(
            gl.COLOR,
            output.location,
            toRGBA(attachment.clearValue ?? [0, 0, 0, 0]),
          );
        }
      });
    }
    if (depthStencilAttachment?.depthLoadOp === 'clear') {
      gl.depthMask(true);
      gl.clearDepth(depthStencilAttachment.depthClearValue ?? 1);
      clearMask |= gl.DEPTH_BUFFER_BIT;
    }
    if (depthStencilAttachment?.stencilLoadOp === 'clear') {
      gl.stencilMaskSeparate(gl.FRONT_AND_BACK, 0xffffffff);
      gl.clearStencil(depthStencilAttachment.stencilClearValue ?? 0);
      clearMask |= gl.STENCIL_BUFFER_BIT;
    }
    if (clearMask !== 0) {
      gl.clear(clearMask);
    }

    applyPrimitiveAndTargetState(gl, primitive, colorOutputs, this.#core.drawBuffersIndexed);
    applyDepthStencilState(gl, depthStencilAttachment ? depthStencil : undefined, {
      depthReadOnly: depthStencilAttachment?.depthReadOnly ?? false,
      stencilReadOnly: depthStencilAttachment?.stencilReadOnly ?? false,
      stencilReference: this.#state.stencilReference,
    });

    gl.useProgram(this.#core.program);
    gl.bindVertexArray(this.#prepareVertexArray());

    // Upload the uniform values that changed since the last draw with this program
    for (const binding of this.#core.uniformBindings) {
      const buffer = binding.uniform.buffer;
      if (binding.uploadedVersion !== buffer.version) {
        binding.uploadedVersion = buffer.version;
        for (const upload of binding.uploads) {
          upload(gl, buffer.arrayBuffer);
        }
      }
    }

    for (let unit = 0; unit < this.#core.textureBindings.length; unit++) {
      const binding = this.#core.textureBindings[unit] as TextureBinding;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, binding.view.texture.raw);
      gl.bindSampler(unit, binding.sampler?.raw ?? null);
      gl.uniform1i(binding.location, unit);
      if (binding.flipLocation !== null) {
        gl.uniform1i(binding.flipLocation, binding.view.texture.needsYFlipWhenSampling ? 1 : 0);
      }
    }

    return () => {
      gl.bindVertexArray(null);
      if (canvasTarget) {
        presenter.endDraw(canvasTarget.canvas);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
  }
}
