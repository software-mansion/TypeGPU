import { tgpu, type TgpuRenderPipeline } from 'typegpu';

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
import {
  WebGLSamplerImpl,
  WebGLTextureImpl,
  WebGLTextureRenderView,
  WebGLTextureView,
} from './webglTexture.ts';
import { uniformSetterFor, type UniformSetter, type WebGLUniform } from './webglUniform.ts';

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
  pipe<T>(transform: (pipeline: this) => T): T;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number): void;
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
  setter: UniformSetter;
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
  readonly vao: WebGLVertexArrayObject;
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

/**
 * What the `with*` methods set. Every derived pipeline has its own.
 */
interface PipelineState {
  readonly colorAttachment: WebGLColorAttachment | Record<string, WebGLColorAttachment> | undefined;
  readonly depthStencilAttachment: WebGLDepthStencilAttachment | undefined;
  readonly stencilReference: number;
}

export interface WebGLRenderPipelineOptions {
  readonly gl: WebGL2RenderingContext;
  readonly offscreen: OffscreenCanvas;
  readonly presenter: CanvasPresenter;
  readonly renderTargets: RenderTargets;
  readonly uniforms: readonly WebGLUniform[];
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

  const vertexCode = tgpu.resolve([fakePipeline], {
    unstable_shaderGenerator: new GlslGenerator('vertex', crossShaderStageState),
  });

  const fragmentCode = tgpu.resolve([fakePipeline], {
    unstable_shaderGenerator: new GlslGenerator('fragment', crossShaderStageState),
  });

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

  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Failed to create VAO');

  // Query uniform locations once; skip uniforms that weren't actually used by the shaders.
  const uniformBindings: UniformBinding[] = [];
  for (const uniform of options.uniforms) {
    const name = crossShaderStageState.globalIdentifierMap.get(uniform);
    if (!name) {
      continue; // Not used in the shader
    }

    const location = gl.getUniformLocation(program, name);
    if (location === null) {
      continue; // Not used in the shader
    }

    uniformBindings.push({
      uniform,
      location,
      setter: uniformSetterFor(uniform.dataType),
    });
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
    vao,
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
    colorAttachment: undefined,
    depthStencilAttachment: undefined,
    stencilReference: 0,
  });
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

  pipe<T>(transform: (pipeline: this) => T): T {
    return transform(this);
  }

  draw(vertexCount: number, _instanceCount = 1, firstVertex = 0): void {
    const endPass = this.#beginPass();
    this.#core.gl.drawArrays(this.#core.primitive.mode, firstVertex, vertexCount);
    endPass();
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
    gl.bindVertexArray(this.#core.vao);

    // Upload current uniform values
    for (const b of this.#core.uniformBindings) {
      b.setter(gl, b.location, b.uniform.buffer);
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
