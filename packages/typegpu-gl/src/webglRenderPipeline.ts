import { d, tgpu, type TgpuRenderPipeline } from 'typegpu';

import { WebGLFallbackUnsupportedError } from './errors.ts';
import {
  applyPrimitiveAndTargetState,
  glColorTargetState,
  glPrimitiveState,
  type ColorTargetState,
  type GLColorTargetState,
  type GLPrimitiveState,
} from './glState.ts';
import { CrossShaderStageState, GlslGenerator } from './glslGenerator.ts';
import type { CanvasPresenter } from './presenter.ts';
import { createStandInRoot } from './standInRoot.ts';
import { WebGLSamplerImpl, WebGLTextureRenderView, WebGLTextureView } from './webglTexture.ts';
import { uniformSetterFor, type UniformSetter, WebGLUniformImpl } from './webglUniform.ts';

// ----------
// Public API
// ----------

export interface WebGLRenderContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly alphaMode?: string | undefined;
}

export interface WebGLColorAttachment {
  view: WebGLRenderContext | WebGLTextureRenderView;
  loadOp?: GPULoadOp;
  storeOp?: GPUStoreOp;
  clearValue?: GPUColor;
}

/**
 * Like the WebGPU render pipeline, every `with*` method returns a new pipeline, leaving
 * the original untouched. Derived pipelines share the compiled program and bindings.
 */
export interface TgpuWebGLRenderPipeline {
  withColorAttachment(attachment: WebGLColorAttachment): this;
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

export function linkProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  let frag: WebGLShader | undefined;

  try {
    frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create WebGL program');

    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${log}`);
    }

    return program;
  } finally {
    gl.deleteShader(vert);
    if (frag) gl.deleteShader(frag);
  }
}

interface UniformBinding {
  uniform: WebGLUniformImpl<d.AnyWgslData>;
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
  readonly primitive: GLPrimitiveState;
  readonly target: GLColorTargetState;
}

/**
 * What the `with*` methods set. Every derived pipeline has its own.
 */
interface PipelineState {
  readonly colorAttachment: WebGLColorAttachment | undefined;
}

export interface WebGLRenderPipelineOptions {
  readonly gl: WebGL2RenderingContext;
  readonly offscreen: OffscreenCanvas;
  readonly presenter: CanvasPresenter;
  /** Shared by the root's pipelines, as none of them set up vertex attributes */
  readonly vao: WebGLVertexArrayObject;
  readonly descriptor: TgpuRenderPipeline.Descriptor;
  /** Called when the pipeline has 'flat' varyings (including integer ones) */
  readonly onFlatVaryings?: (() => void) | undefined;
  /** Returns a linked program for the given shaders, possibly a cached one */
  readonly getProgram: (vertexGlsl: string, fragmentGlsl: string) => WebGLProgram;
}

/**
 * Picks the state of the one color target WebGL can render to. Like `connectTargetsToShader`
 * in TypeGPU, the fragment output schema decides how `targets` is read: a struct output
 * means a record of states keyed by output name, anything else means a single state.
 */
function singleColorTarget(
  targets: TgpuRenderPipeline.Descriptor['targets'],
  fragmentOutputNames: readonly string[] | undefined,
): ColorTargetState {
  if (fragmentOutputNames === undefined) {
    return targets as ColorTargetState;
  }
  if (fragmentOutputNames.length > 1) {
    throw new WebGLFallbackUnsupportedError('multiple render targets');
  }
  const [name] = fragmentOutputNames;
  return name === undefined
    ? undefined
    : (targets as Record<string, ColorTargetState> | undefined)?.[name];
}

export function createWebGLRenderPipeline(
  options: WebGLRenderPipelineOptions,
): TgpuWebGLRenderPipeline {
  const { gl, descriptor } = options;

  // Validating what we can of the descriptor before compiling anything
  const primitive = glPrimitiveState(gl, descriptor.primitive);
  if ((descriptor.multisample?.count ?? 1) > 1) {
    throw new WebGLFallbackUnsupportedError(
      'multisampled pipelines',
      'multisampled textures are not supported, but the default framebuffer is antialiased by the browser',
    );
  }

  // Reusing the WebGPU pipeline's resolution logic (IO schemas, varying locations, ...),
  // only swapping out the shader generator.
  const fakeRoot = createStandInRoot();
  // oxlint-disable-next-line typescript/no-explicit-any
  const fakePipeline = fakeRoot.createRenderPipeline(descriptor as any);

  const crossShaderStageState = new CrossShaderStageState();
  // The size of points is undefined unless the vertex shader writes it, WebGPU's are 1px
  crossShaderStageState.writesPointSize = primitive.mode === gl.POINTS;

  const vertexCode = tgpu.resolve([fakePipeline], {
    unstable_shaderGenerator: new GlslGenerator('vertex', crossShaderStageState),
  });

  const fragmentCode = tgpu.resolve([fakePipeline], {
    unstable_shaderGenerator: new GlslGenerator('fragment', crossShaderStageState),
  });

  // Needs the fragment output schema, which is only known after generating the fragment shader
  const target = glColorTargetState(
    gl,
    singleColorTarget(descriptor.targets, crossShaderStageState.fragmentOutputNames),
  );

  const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
  for (const [key, { location }] of crossShaderStageState.vertexInputs) {
    if (location >= maxVertexAttribs) {
      throw new WebGLFallbackUnsupportedError(
        `vertex input locations above ${maxVertexAttribs - 1}`,
        `'${key}' is at location ${location}, the maximum on this device is ${maxVertexAttribs - 1}`,
      );
    }
  }

  if ([...crossShaderStageState.varyingQualifiers.values()].includes('flat ')) {
    options.onFlatVaryings?.();
  }

  const program = options.getProgram(GLSL_HEADER + vertexCode, GLSL_HEADER + fragmentCode);

  // Query uniform locations once, for the uniforms the shaders actually use.
  const uniformBindings: UniformBinding[] = [];
  for (const [uniform, name] of crossShaderStageState.globalIdentifierMap) {
    if (!(uniform instanceof WebGLUniformImpl)) continue;

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
  const textureBindings: TextureBinding[] = [];
  for (const [resource, name] of crossShaderStageState.globalIdentifierMap) {
    if (!(resource instanceof WebGLTextureView)) continue;
    const location = gl.getUniformLocation(program, name);
    if (location === null) continue;
    const samplerName = crossShaderStageState.textureSamplerPairs.get(name);
    const pairedSampler = samplerName ? resourcesByName.get(samplerName) : undefined;
    // Textures that are only loaded from (with `texelFetch`) have no sampler
    const sampler = pairedSampler instanceof WebGLSamplerImpl ? pairedSampler : undefined;
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
    vao: options.vao,
    offscreen: options.offscreen,
    presenter: options.presenter,
    uniformBindings,
    textureBindings,
    primitive,
    target,
  };

  return new TgpuWebGLRenderPipelineImpl(core, { colorAttachment: undefined });
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
    return this.#with({ colorAttachment: attachment });
  }

  pipe<T>(transform: (pipeline: this) => T): T {
    return transform(this);
  }

  draw(vertexCount: number, _instanceCount = 1, firstVertex = 0): void {
    const { gl, presenter, offscreen, primitive } = this.#core;
    const { colorAttachment } = this.#state;

    const target = colorAttachment?.view;
    if (target && !(target instanceof WebGLTextureRenderView)) {
      presenter.beginDraw(target.canvas);
    } else if (!target) {
      // Drawing without an attachment still goes into the shared drawing buffer, which
      // would overwrite an image that is yet to be presented.
      presenter.flush();
    }

    if (target instanceof WebGLTextureRenderView) {
      target.texture.needsYFlipWhenSampling = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.size[0], target.size[1]);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, offscreen.width, offscreen.height);
    }

    if (colorAttachment?.loadOp !== 'load') {
      const clear = colorAttachment?.clearValue ?? [0, 0, 0, 0];
      const rgba =
        Symbol.iterator in Object(clear)
          ? [...(clear as Iterable<number>)]
          : [
              (clear as GPUColorDict).r,
              (clear as GPUColorDict).g,
              (clear as GPUColorDict).b,
              (clear as GPUColorDict).a,
            ];
      // Unlike WebGPU's clears, GL's are affected by the write mask and scissor test
      gl.disable(gl.SCISSOR_TEST);
      // GL dithers clears too (it's on by default), WebGPU's clears are exact
      gl.disable(gl.DITHER);
      gl.colorMask(true, true, true, true);
      gl.clearColor(rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    applyPrimitiveAndTargetState(gl, primitive, this.#core.target);

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

    gl.drawArrays(primitive.mode, firstVertex, vertexCount);

    gl.bindVertexArray(null);

    if (target && !(target instanceof WebGLTextureRenderView)) {
      presenter.endDraw(target.canvas);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
