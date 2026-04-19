/**
 * WebGL 2 fallback backend for TypeGPU.
 *
 * Provides a limited implementation of TgpuRoot that uses WebGL 2 instead of WebGPU.
 * Only render pipelines with vertex + fragment shaders are supported.
 * Compute operations, storage buffers, textures, etc. throw WebGLFallbackUnsupportedError.
 */

import tgpu, { d, ShaderGenerator, type TgpuFragmentFn, type TgpuVertexFn } from 'typegpu';
import glslGenerator from './glslGenerator.ts';

const { $gpuValueOf, $internal, $ownSnippet, $resolve, snip, valueProxyHandler, inCodegenMode } =
  ShaderGenerator;

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
  withColorAttachment(attachment: { view: WebGLRenderContext | 'screen' }): this;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number): void;
}

interface WebGLUniform<TData extends d.AnyWgslData = d.AnyWgslData> {
  readonly resourceType: 'uniform';
  readonly schema: TData;
  write(data: d.Infer<TData>): void;
  readonly $: d.InferGPU<TData>;
  /** @internal The stable GLSL identifier for this uniform */
  readonly glslName: string;
  /** @internal The latest Float32Array representation of the written data */
  readonly latestData: Float32Array;
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
  setter: (gl: WebGL2RenderingContext, loc: WebGLUniformLocation, data: Float32Array) => void;
}

function uniformSetterFor(
  schema: d.AnyWgslData,
): (gl: WebGL2RenderingContext, loc: WebGLUniformLocation, data: Float32Array) => void {
  const typeName = (schema as { type: string }).type;
  if (typeName === 'f32') return (gl, loc, data) => gl.uniform1f(loc, data[0] ?? 0);
  if (typeName === 'u32') return (gl, loc, data) => gl.uniform1ui(loc, data[0] ?? 0);
  if (typeName === 'i32') return (gl, loc, data) => gl.uniform1i(loc, data[0] ?? 0);
  if (typeName === 'vec2f') return (gl, loc, data) => gl.uniform2fv(loc, data);
  if (typeName === 'vec3f') return (gl, loc, data) => gl.uniform3fv(loc, data.subarray(0, 3));
  if (typeName === 'vec4f') return (gl, loc, data) => gl.uniform4fv(loc, data);
  if (typeName === 'mat2x2f') return (gl, loc, data) => gl.uniformMatrix2fv(loc, false, data);
  if (typeName === 'mat3x3f') return (gl, loc, data) => gl.uniformMatrix3fv(loc, false, data);
  if (typeName === 'mat4x4f') return (gl, loc, data) => gl.uniformMatrix4fv(loc, false, data);
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
    uniforms: Array<WebGLUniform>,
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
        bindings.push({ uniform, location, setter: uniformSetterFor(uniform.schema) });
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
      b.setter(gl, b.location, b.uniform.latestData);
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
  readonly [$internal] = { dataType: undefined as TData | undefined };
  readonly glslName: string;
  latestData: Float32Array;

  #schema: TData;

  constructor(schema: TData) {
    this.#schema = schema;
    this.glslName = `_u${_uniformCounter++}`;
    this.latestData = new Float32Array(schemaFloatCount(schema));
  }

  get schema(): TData {
    return this.#schema;
  }

  write(data: d.Infer<TData>): void {
    this.latestData = flattenToFloat32(data);
  }

  toString(): string {
    return `uniform:${this.glslName}`;
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  [$resolve](ctx: any) {
    const dataType = this.#schema;
    const glslType = ctx.resolve(dataType).value;
    ctx.addDeclaration(`uniform ${glslType} ${this.glslName};`);
    return snip(this.glslName, dataType as d.BaseData, 'uniform');
  }

  get [$gpuValueOf](): d.InferGPU<TData> {
    const self = this;
    const dataType = this.#schema;
    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, dataType as d.BaseData, 'uniform');
        },
        // oxlint-disable-next-line typescript/no-explicit-any
        [$resolve]: (ctx: any) => ctx.resolve(self),
        toString: () => `uniform:${self.glslName}.$`,
      },
      valueProxyHandler,
    ) as d.InferGPU<TData>;
  }

  get $(): d.InferGPU<TData> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }
    throw new Error(
      'Cannot read WebGL uniform outside of shader code. Use `.write()` to update it.',
    );
  }
}

function schemaFloatCount(schema: d.AnyWgslData): number {
  const typeName = (schema as { type: string }).type;
  if (typeName === 'f32' || typeName === 'u32' || typeName === 'i32' || typeName === 'bool') {
    return 1;
  }
  if (typeName?.startsWith('vec2')) return 2;
  if (typeName?.startsWith('vec3')) return 4; // vec3 is typically stored as vec4 aligned
  if (typeName?.startsWith('vec4')) return 4;
  if (typeName?.startsWith('mat2x2')) return 4;
  if (typeName?.startsWith('mat3x3')) return 9;
  if (typeName?.startsWith('mat4x4')) return 16;
  return 1;
}

function flattenToFloat32(data: unknown): Float32Array {
  if (data instanceof Float32Array) return data;
  if (typeof data === 'number') return new Float32Array([data]);
  if (Array.isArray(data)) {
    const arr: number[] = [];
    for (const item of data) {
      const sub = flattenToFloat32(item);
      for (const v of sub) arr.push(v);
    }
    return new Float32Array(arr);
  }
  if (data !== null && typeof data === 'object') {
    const arr: number[] = [];
    for (const val of Object.values(data as Record<string, unknown>)) {
      const sub = flattenToFloat32(val);
      for (const v of sub) arr.push(v);
    }
    return new Float32Array(arr);
  }
  return new Float32Array([0]);
}

// oxlint-disable-next-line typescript/no-explicit-any
type AnyFn = (...args: any[]) => any;

function isShellFn(value: unknown): value is TgpuVertexFn | TgpuFragmentFn {
  return typeof value === 'object' && value !== null && 'shell' in value;
}

export class TgpuRootWebGL {
  readonly #shaderGenerator: ShaderGenerator = glslGenerator;

  #gl: WebGL2RenderingContext;
  #offscreen: OffscreenCanvas;
  #uniforms: Array<WebGLUniformImpl<d.AnyWgslData>> = [];
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
    _initial?: d.Infer<TData>,
  ): WebGLUniform<TData> {
    const uniform = new WebGLUniformImpl(typeSchema);
    this.#uniforms.push(uniform as WebGLUniformImpl<d.AnyWgslData>);
    if (_initial !== undefined) {
      uniform.write(_initial);
    }
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

    const { AutoVertexFn, AutoFragmentFn, matchUpVaryingLocations } = ShaderGenerator;

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
    this.#uniforms = [];
  }
}

export function isGLRoot(value: unknown): value is TgpuRootWebGL {
  return value instanceof TgpuRootWebGL;
}
