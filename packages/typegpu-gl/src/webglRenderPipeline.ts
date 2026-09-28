import { tgpu, type TgpuRenderPipeline } from 'typegpu';

import { CrossShaderStageState, GlslGenerator } from './glslGenerator.ts';
import type { CanvasPresenter } from './presenter.ts';
import { WebGLSamplerImpl, WebGLTextureRenderView, WebGLTextureView } from './webglTexture.ts';
import { uniformSetterFor, type UniformSetter, type WebGLUniform } from './webglUniform.ts';

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
  readonly uniforms: readonly WebGLUniform[];
  readonly descriptor: TgpuRenderPipeline.Descriptor;
}

export function createWebGLRenderPipeline(
  options: WebGLRenderPipelineOptions,
): TgpuWebGLRenderPipeline {
  const { gl, descriptor } = options;

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
    const { gl, presenter, offscreen } = this.#core;
    const { colorAttachment } = this.#state;

    const target = colorAttachment?.view;
    if (target && !(target instanceof WebGLTextureRenderView)) {
      presenter.beginDraw(target.canvas);
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
      gl.clearColor(rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

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

    gl.drawArrays(gl.TRIANGLES, firstVertex, vertexCount);

    gl.bindVertexArray(null);

    if (target && !(target instanceof WebGLTextureRenderView)) {
      presenter.endDraw(target.canvas);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
