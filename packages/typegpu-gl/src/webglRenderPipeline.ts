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
  withColorAttachment(attachment: WebGLColorAttachment): this;
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
  readonly target: GLColorTargetState;
  readonly depthStencil: GLDepthStencilState | undefined;
}

/**
 * What the `with*` methods set. Every derived pipeline has its own.
 */
interface PipelineState {
  readonly colorAttachment: WebGLColorAttachment | undefined;
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

function isColorTargetState(
  targets: NonNullable<TgpuRenderPipeline.Descriptor['targets']>,
): targets is NonNullable<ColorTargetState> {
  const values = Object.values(targets) as unknown[];
  return (
    values.length === 0 ||
    typeof (targets as GPUColorTargetState).format === 'string' ||
    typeof (targets as GPUColorTargetState).writeMask === 'number' ||
    (targets as GPUColorTargetState).blend?.color !== undefined
  );
}

function singleColorTarget(targets: TgpuRenderPipeline.Descriptor['targets']): ColorTargetState {
  if (!targets || isColorTargetState(targets)) {
    return targets;
  }
  const values = Object.values(targets);
  if (values.length > 1) {
    throw new WebGLFallbackUnsupportedError('multiple render targets');
  }
  return values[0];
}

export function createWebGLRenderPipeline(
  options: WebGLRenderPipelineOptions,
): TgpuWebGLRenderPipeline {
  const { gl, descriptor } = options;

  // Validating the descriptor before compiling anything
  const primitive = glPrimitiveState(gl, descriptor.primitive);
  const target = glColorTargetState(gl, singleColorTarget(descriptor.targets));
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
    target,
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

  withColorAttachment(attachment: WebGLColorAttachment): this {
    if (attachment.resolveTarget !== undefined) {
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
    const { gl, presenter, offscreen, primitive, depthStencil } = this.#core;
    const { colorAttachment, depthStencilAttachment } = this.#state;

    const target = colorAttachment ? resolveColorView(colorAttachment.view) : undefined;
    const depthTarget = depthStencilAttachment
      ? resolveDepthTarget(depthStencilAttachment.view)
      : undefined;

    if (depthStencil && !depthStencilAttachment) {
      throw new Error(
        'The pipeline was created with depthStencil state, so it requires a depth-stencil attachment. See withDepthStencilAttachment().',
      );
    }

    if (target instanceof WebGLTextureRenderView) {
      target.texture.needsYFlipWhenSampling = true;
      if (depthTarget instanceof WebGLTextureRenderView) {
        depthTarget.texture.needsYFlipWhenSampling = true;
      }
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        this.#core.renderTargets.framebufferFor([target], depthTarget),
      );
      gl.viewport(0, 0, target.size[0], target.size[1]);
    } else {
      if (target) {
        presenter.beginDraw(target.canvas);
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
    }

    // Unlike WebGPU's clears, GL's are affected by write masks and the scissor test
    gl.disable(gl.SCISSOR_TEST);
    let clearMask = 0;
    if (colorAttachment?.loadOp !== 'load') {
      gl.colorMask(true, true, true, true);
      gl.clearColor(...toRGBA(colorAttachment?.clearValue ?? [0, 0, 0, 0]));
      clearMask |= gl.COLOR_BUFFER_BIT;
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

    applyPrimitiveAndTargetState(gl, primitive, this.#core.target);
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
      if (target && !(target instanceof WebGLTextureRenderView)) {
        presenter.endDraw(target.canvas);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
  }
}
