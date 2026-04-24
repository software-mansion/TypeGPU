/**
 * WebGL 2 fallback backend for TypeGPU.
 *
 * Provides a limited implementation of TgpuRoot that uses WebGL 2 instead of WebGPU.
 * Only render pipelines with vertex + fragment shaders are supported.
 * Compute operations, storage buffers, textures, etc. throw WebGLFallbackUnsupportedError.
 */

import { BufferWriter, BufferReader } from 'typed-binary';
import tgpu, {
  d,
  type BufferInitialData,
  type BufferWriteOptions,
  type TgpuBuffer,
  type TgpuFragmentFn,
  type TgpuVertexFn,
} from 'typegpu';
import {
  readData,
  writeData,
  AutoFragmentFn,
  AutoVertexFn,
  makeDereferencable,
  makeResolvable,
  type ShaderGenerator,
} from 'typegpu/~internals';

import glslGenerator from './glslGenerator.ts';
import { matchUpVaryingLocations } from './matchUpVaryingLocations.ts';

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
  // TODO: Is 'screen' necessary?
  withColorAttachment(attachment: { view: WebGLRenderContext | 'screen' }): this;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number): void;
}

interface WebGLUniform<TData extends d.AnyWgslData = d.AnyWgslData> {
  readonly resourceType: 'uniform';
  readonly dataType: TData;
  write(data: d.Infer<TData>): void;

  readonly $: d.InferGPU<TData>;

  /** @internal The stable GLSL identifier for this uniform */
  readonly glslName: string;
  /** @internal The latest ArrayBuffer representation of the written data */
  readonly buffer: ArrayBuffer;
}

// ----------
// Implementation
// ----------

const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2 saturate(vec2 x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }
vec4 saturate(vec4 x) { return clamp(x, 0.0, 1.0); }

`;

/**
 * Applies post-processing fixups to WGSL-like output produced by the resolution
 * pipeline so it becomes valid GLSL ES 3.0.
 *
 * Some resolutions (like `tgpu.const`) emit WGSL syntax (e.g. `const x: T = ...;`)
 * that we can't cleanly intercept from a generator alone; we rewrite those here.
 */
function wgslToGlslFixups(code: string): string {
  let out = code;

  // WGSL integer literal suffix: `5i` -> `5`, `5u` -> `5` (GLSL happily accepts bare ints).
  out = out.replaceAll(/(\d+)[iu]\b/g, '$1');

  // WGSL f32 literal suffixes -> GLSL float literals. A trailing `f` always marks a float,
  // but GLSL requires a decimal point to disambiguate floats from ints.
  // Handle scientific notation first (`1e-3f` -> `1e-3`), so the plain-int rule below doesn't
  // mistakenly turn the exponent's digits into `1e-3.0`.
  out = out.replaceAll(/(\d+(?:\.\d+)?[eE][+-]?\d+)f\b/g, '$1');
  out = out.replaceAll(/(\d+\.\d+)f\b/g, '$1');
  out = out.replaceAll(/(\d+)f\b/g, '$1.0');

  // WGSL private module var -> GLSL global var.
  out = out.replaceAll(/\bvar<private>\s+([A-Za-z_]\w*)\s*:\s*([^;=]+?)\s*;/g, '$2 $1;');
  out = out.replaceAll(/\bvar<private>\s+([A-Za-z_]\w*)\s*:\s*([^;=]+?)\s*=\s*/g, '$2 $1 = ');

  // `sample` is a reserved word in GLSL ES (for multisample interpolation qualifiers),
  // so rename any identifier `sample` used as a function or variable name.
  out = out.replaceAll(/\bsample\b/g, 'sample_');

  // WGSL array type in expressions `array<T, N>(...)` -> `T[N](...)`
  out = out.replaceAll(/array<([^,<>]+?),\s*(\d+)>/g, '$1[$2]');

  // WGSL const decls: `const NAME: TYPE = VALUE;` -> GLSL style.
  //   TYPE can include brackets if it started as `array<T, N>` (already rewritten to `T[N]`).
  //   For GLSL arrays, the brackets go AFTER the identifier: `const T NAME[N] = ...`.
  out = out.replaceAll(
    /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]+\])?\s*=\s*/g,
    (_m, name, baseType, arraySuffix) => {
      if (arraySuffix) {
        return `const ${baseType} ${name}${arraySuffix} = `;
      }
      return `const ${baseType} ${name} = `;
    },
  );

  // Empty vector constructors `vecN()` are illegal in GLSL; default to zero.
  out = out.replaceAll(/\b(vec[234]|ivec[234]|uvec[234]|bvec[234])\s*\(\s*\)/g, '$1(0)');

  return out;
}

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

function uniformSetterFor(
  schema: d.AnyWgslData,
): (gl: WebGL2RenderingContext, loc: WebGLUniformLocation, dataView: ArrayBuffer) => void {
  const typeName = (schema as { type: string }).type;
  if (typeName === 'f32')
    return (gl, loc, data) => gl.uniform1f(loc, new Float32Array(data)[0] ?? 0);
  if (typeName === 'u32')
    return (gl, loc, data) => gl.uniform1ui(loc, new Float32Array(data)[0] ?? 0);
  if (typeName === 'i32')
    return (gl, loc, data) => gl.uniform1i(loc, new Float32Array(data)[0] ?? 0);
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
  #renderCtx: WebGLRenderContext | 'screen' | null = null;
  #offscreen: OffscreenCanvas;
  #vao: WebGLVertexArrayObject;

  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    uniforms: WebGLUniform[],
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
      const location = gl.getUniformLocation(program, uniform.glslName);
      if (location !== null) {
        bindings.push({ uniform, location, setter: uniformSetterFor(uniform.dataType) });
      }
    }
    this.#uniformBindings = bindings;
  }

  withColorAttachment(attachment: { view: WebGLRenderContext | 'screen' }): this {
    this.#renderCtx = attachment.view;
    return this;
  }

  draw(vertexCount: number, _instanceCount = 1, firstVertex = 0): void {
    const gl = this.#gl;

    // Resize offscreen canvas to match the target
    if (this.#renderCtx && this.#renderCtx !== 'screen') {
      const canvas = this.#renderCtx.canvas;
      this.#offscreen.width = canvas.width;
      this.#offscreen.height = canvas.height;
    }

    gl.viewport(0, 0, this.#offscreen.width, this.#offscreen.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);

    // Upload current uniform values
    for (const b of this.#uniformBindings) {
      b.setter(gl, b.location, b.uniform.buffer);
    }

    gl.drawArrays(gl.TRIANGLES, firstVertex, vertexCount);

    gl.bindVertexArray(null);

    // Blit offscreen to the user-provided canvas
    if (this.#renderCtx && this.#renderCtx !== 'screen') {
      const canvas = this.#renderCtx.canvas as HTMLCanvasElement;
      const bitmapCtx = canvas.getContext('bitmaprenderer');
      if (bitmapCtx) {
        const bitmap = this.#offscreen.transferToImageBitmap();
        bitmapCtx.transferFromImageBitmap(bitmap);
      }
    }
  }
}

let _uniformCounter = 0;

/** @internal Reset the uniform name counter. For use in tests only. */
export function _resetUniformCounter(): void {
  _uniformCounter = 0;
}

class WebGLUniformImpl<TData extends d.AnyWgslData> implements WebGLUniform<TData> {
  readonly resourceType = 'uniform' as const;
  readonly glslName: string;

  readonly #gl: WebGL2RenderingContext;
  readonly #initial: BufferInitialData<TData> | undefined;

  readonly dataType: TData;

  buffer: ArrayBuffer;
  webglBuffer: WebGLBuffer | undefined;

  declare readonly $: d.InferGPU<TData>;

  constructor(gl: WebGL2RenderingContext, dataType: TData, initial?: BufferInitialData<TData>) {
    this.#gl = gl;
    this.dataType = dataType;
    this.#initial = initial;
    this.glslName = `_u${_uniformCounter++}`;
    this.buffer = new ArrayBuffer(d.sizeOf(dataType));
  }

  unwrap() {
    if (!this.webglBuffer) {
      const gl = this.#gl;
      this.webglBuffer = gl.createBuffer();
      const bindingPoint = 0;
      gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, this.webglBuffer);
      const initialData =
        typeof this.#initial === 'function' ? (this.#initial as any)(this) : undefined;
      this.#populateBackingBuffer(initialData);

      gl.bufferData(gl.UNIFORM_BUFFER, this.buffer, gl.DYNAMIC_DRAW);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, null);
    }
    return this.webglBuffer;
  }

  #populateBackingBuffer(data: d.InferInput<TData>, options?: BufferWriteOptions) {
    const startOffset = options?.startOffset ?? 0;
    const endOffset = options?.endOffset ?? this.buffer.byteLength;

    // Fast path: raw byte copy, user guarantees the padded layout
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const src =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const regionSize = endOffset - startOffset;
      if (src.byteLength !== regionSize) {
        console.warn(
          `Buffer size mismatch: expected ${regionSize} bytes, got ${src.byteLength}. ` +
            (src.byteLength < regionSize ? 'Data truncated.' : 'Excess ignored.'),
        );
      }
      const copyLen = Math.min(src.byteLength, regionSize);
      new Uint8Array(this.buffer).set(src.subarray(0, copyLen), startOffset);
      return;
    }

    const writer = new BufferWriter(this.buffer);
    writer.seekTo(startOffset);
    writeData(writer, this.dataType, data as d.Infer<TData>);
  }

  write(data: d.InferInput<TData>, options?: BufferWriteOptions): void {
    this.#populateBackingBuffer(data, options);
  }

  public patch(_data: d.InferPatch<TData>): void {
    // TODO(#2410): A lower-level patching API would be helpful here
    throw new WebGLFallbackUnsupportedError('.patch()');
  }

  public clear(): void {
    new Uint8Array(this.buffer).fill(0);
  }

  copyFrom(_srcBuffer: TgpuBuffer<d.MemIdentity<TData>>): void {
    throw new WebGLFallbackUnsupportedError('.copyFrom()');
  }

  read(): Promise<d.Infer<TData>> {
    return Promise.resolve(readData(new BufferReader(this.buffer), this.dataType));
  }

  destroy() {
    if (this.webglBuffer) {
      this.#gl.deleteBuffer(this.webglBuffer);
      this.webglBuffer = undefined;
    }
  }

  toString(): string {
    return `uniform:${this.glslName}`;
  }
}

makeDereferencable(
  makeResolvable(WebGLUniformImpl.prototype, {
    resolve(ctx) {
      const glslType = ctx.resolve(this.dataType).value;
      ctx.addDeclaration(`uniform ${glslType} ${this.glslName};`);
      return { value: this.glslName, dataType: this.dataType, origin: 'uniform' };
    },
    asString() {
      return `uniform:${this.glslName}`;
    },
  }),
  {
    getDataTypeAndOrigin(): [dataType: d.BaseData, origin: 'uniform'] {
      return [this.dataType, 'uniform'];
    },
  },
);

// oxlint-disable-next-line typescript/no-explicit-any
type AnyFn = (...args: any[]) => any;

function isShellFn(value: unknown): value is TgpuVertexFn | TgpuFragmentFn {
  return typeof value === 'object' && value !== null && 'shell' in value;
}

export class TgpuRootWebGL {
  readonly #shaderGenerator: ShaderGenerator = glslGenerator;

  #gl: WebGL2RenderingContext;
  #offscreen: OffscreenCanvas;
  #uniforms: WebGLUniformImpl<any>[] = [];
  #buffers: WebGLBuffer[] = [];

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
    const uniform = new WebGLUniformImpl(this.#gl, typeSchema, initial);
    this.#uniforms.push(uniform);
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

  beginRenderPass(): never {
    throw new WebGLFallbackUnsupportedError('beginRenderPass');
  }

  beginRenderBundleEncoder(): never {
    throw new WebGLFallbackUnsupportedError('beginRenderBundleEncoder');
  }

  createTexture(): never {
    throw new WebGLFallbackUnsupportedError('createTexture');
  }

  createSampler(): never {
    throw new WebGLFallbackUnsupportedError('createSampler');
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

  createRenderPipeline(descriptor: {
    vertex: TgpuVertexFn | AnyFn;
    fragment: TgpuFragmentFn | AnyFn;
  }): TgpuWebGLRenderPipeline {
    const { vertex, fragment } = descriptor;

    const vertexShell = isShellFn(vertex) ? vertex : undefined;
    const fragmentShell = isShellFn(fragment) ? fragment : undefined;

    const locations = matchUpVaryingLocations(
      vertexShell?.shell?.out,
      fragmentShell?.shell?.in,
      '<vertex>',
      '<fragment>',
    );

    const vertexResolvable = vertexShell ?? new AutoVertexFn(vertex as AnyFn, {}, locations);
    const fragmentFromAuto = fragmentShell === undefined;

    const vertexNamespace = tgpu['~unstable'].namespace();
    const vertexCode = tgpu.resolve([vertexResolvable], {
      unstable_shaderGenerator: this.#shaderGenerator,
      names: vertexNamespace,
    });

    // For the fragment, we want to know the vertex output varyings to route them as inputs.
    // When using an auto-vertex-fn, we need the completed struct.
    let varyings: Record<string, d.BaseData> = {};
    if (vertexResolvable instanceof AutoVertexFn) {
      const outStruct = vertexResolvable.autoOut.completeStruct;
      varyings = Object.fromEntries(
        Object.entries(outStruct.propTypes).filter(([, type]) => !d.isBuiltin(type)),
      );
    } else if (vertexShell?.shell?.out) {
      varyings = Object.fromEntries(
        Object.entries(vertexShell.shell.out as Record<string, d.BaseData>).filter(
          ([, type]) => !d.isBuiltin(type),
        ),
      );
    }

    const fragmentResolvable =
      fragmentShell ?? new AutoFragmentFn(fragment as AnyFn, varyings, locations);

    const fragmentNamespace = tgpu['~unstable'].namespace();
    const fragmentCode = tgpu.resolve([fragmentResolvable], {
      unstable_shaderGenerator: this.#shaderGenerator,
      names: fragmentNamespace,
    });

    const vertexGlsl = GLSL_HEADER + wgslToGlslFixups(vertexCode);
    const fragmentGlsl = GLSL_HEADER + wgslToGlslFixups(fragmentCode);

    // Silence unused variable lints for the shell-only fallback
    void fragmentFromAuto;

    const program = linkProgram(this.#gl, vertexGlsl, fragmentGlsl);

    return new TgpuWebGLRenderPipelineImpl(
      this.#gl,
      program,
      this.#uniforms.slice() as Array<WebGLUniform>,
      this.#offscreen,
    );
  }

  with(_slot: unknown, _value: unknown): this {
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
    return this;
  }

  flush(): void {}

  destroy(): void {
    for (const buf of this.#buffers) {
      this.#gl.deleteBuffer(buf);
    }
    this.#buffers = [];
    for (const uniform of this.#uniforms) {
      uniform.destroy();
    }
    this.#uniforms = [];
  }
}

export function isGLRoot(value: unknown): value is TgpuRootWebGL {
  return value instanceof TgpuRootWebGL;
}
