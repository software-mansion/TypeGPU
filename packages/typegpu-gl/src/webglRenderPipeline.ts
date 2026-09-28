import type { CrossShaderStageState } from './glslGenerator.ts';
import type { CanvasPresenter } from './presenter.ts';
import { WebGLSamplerImpl, WebGLTextureRenderView, WebGLTextureView } from './webglTexture.ts';
import {
  uniformSetterFor,
  WebGLUniformImpl,
  type UniformSetter,
  type WebGLUniform,
} from './webglUniform.ts';

// ----------
// Public API
// ----------

export interface WebGLRenderContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly alphaMode?: string | undefined;
}

export interface TgpuWebGLRenderPipeline {
  withColorAttachment(attachment: WebGLColorAttachment): this;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number): void;
}

export interface WebGLColorAttachment {
  view: WebGLRenderContext | WebGLTextureRenderView;
  loadOp?: GPULoadOp;
  storeOp?: GPUStoreOp;
  clearValue?: GPUColor;
}

// ----------
// Implementation
// ----------

export const GLSL_HEADER = `#version 300 es
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

export class TgpuWebGLRenderPipelineImpl implements TgpuWebGLRenderPipeline {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #uniformBindings: UniformBinding[];
  #textureBindings: TextureBinding[];
  #colorAttachment: WebGLColorAttachment | null = null;
  #offscreen: OffscreenCanvas;
  #presenter: CanvasPresenter;
  #vao: WebGLVertexArrayObject;

  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    crossShaderStageState: CrossShaderStageState,
    offscreen: OffscreenCanvas,
    presenter: CanvasPresenter,
    vao: WebGLVertexArrayObject,
  ) {
    this.#gl = gl;
    this.#program = program;
    this.#offscreen = offscreen;
    this.#presenter = presenter;
    this.#vao = vao;

    // Discover bindings from shader references, without retaining a root-wide uniform history.
    const bindings: UniformBinding[] = [];
    for (const [uniform, name] of crossShaderStageState.globalIdentifierMap) {
      if (!(uniform instanceof WebGLUniformImpl)) continue;

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
      this.#presenter.beginDraw(target.canvas);
    } else if (!target) {
      // Drawing without an attachment still goes into the shared drawing buffer, which
      // would overwrite an image that is yet to be presented.
      this.#presenter.flush();
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
      this.#presenter.endDraw(target.canvas);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
