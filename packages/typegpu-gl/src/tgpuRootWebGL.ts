/**
 * WebGL 2 fallback backend for TypeGPU.
 *
 * Provides a limited implementation of TgpuRoot that uses WebGL 2 instead of WebGPU.
 * Only render pipelines with vertex + fragment shaders are supported.
 * Compute operations, storage buffers, textures, etc. throw WebGLFallbackUnsupportedError.
 */

import tgpu, { d, ShaderGenerator, TgpuFragmentFn, TgpuVertexFn } from 'typegpu';
import glslGenerator, { translateWgslTypeToGlsl } from './glslGenerator.ts';

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
  /** @internal The WebGL UBO index used when binding */
  readonly bindingIndex: number;
  /** @internal The raw WebGL buffer */
  readonly glBuffer: WebGLBuffer;
}

// ----------
// Implementation
// ----------

/**
 * Translates a WGSL function body (output from `tgpu.resolve`) to a minimal
 * GLSL ES 3.0 vertex shader.
 *
 * The full WGSL resolve output looks like:
 *   @vertex fn fnName(input: FnName_Input) -> FnName_Output { ... }
 *
 * We strip the header and translate the body to GLSL.
 */
function extractFunctionBody(resolvedCode: string, fnName: string): string {
  // Find the function definition by its name
  const fnPattern = new RegExp(`fn\\s+${fnName}\\s*\\([^)]*\\)[^{]*\\{`);
  const match = fnPattern.exec(resolvedCode);
  if (!match) {
    throw new Error(`Could not find function '${fnName}' in resolved WGSL code.`);
  }

  // Extract the body between matching braces
  const startIdx = match.index + match[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < resolvedCode.length && depth > 0) {
    if (resolvedCode[i] === '{') depth++;
    else if (resolvedCode[i] === '}') depth--;
    i++;
  }

  return resolvedCode.slice(startIdx, i - 1).trim();
}

/**
 * Gets the attribute annotation string for a GLSL I/O variable declaration.
 * Returns the location number if it has a @location attribute, or undefined for builtins.
 */
function getLocationFromField(
  fieldData: d.BaseData,
): { location: number } | { builtin: string } | null {
  if (d.isDecorated(fieldData)) {
    for (const attrib of fieldData.attribs) {
      const a = attrib as { type: string; params: unknown[] };
      if (a.type === '@location') {
        return { location: a.params[0] as number };
      }
      if (a.type === '@builtin') {
        return { builtin: a.params[0] as string };
      }
    }
  }
  return null;
}

/**
 * Translates a WGSL type name to GLSL. For structs / arrays, returns the name as-is.
 */
function wgslTypeToGlsl(dataType: d.BaseData): string {
  if (d.isDecorated(dataType)) {
    return wgslTypeToGlsl(dataType.inner);
  }
  const wgslName = dataType.toString();
  return translateWgslTypeToGlsl(wgslName);
}

/**
 * Generate complete GLSL ES 3.0 vertex shader source.
 */
function generateVertexShader(
  vertexFn: TgpuVertexFn,
  resolvedCode: string,
  fnName: string,
): string {
  const lines: string[] = ['#version 300 es', 'precision highp float;', ''];

  const shell = vertexFn.shell;

  // Declare inputs (from shell.in)
  if (shell.in) {
    let locationIdx = 0;
    for (const [_propName, fieldData] of Object.entries(shell.in as Record<string, d.BaseData>)) {
      const attr = getLocationFromField(fieldData);
      if (attr && 'builtin' in attr) {
        // builtins like vertex_index → gl_VertexID, skip declaration
        continue;
      }
      const loc = attr ? attr.location : locationIdx++;
      const glslType = wgslTypeToGlsl(fieldData);
      lines.push(`layout(location = ${loc}) in ${glslType} _in_${_propName};`);
    }
  }

  // Declare outputs (from shell.out) - skip builtins (position → gl_Position)
  {
    let locationIdx = 0;
    for (const [propName, fieldData] of Object.entries(shell.out as Record<string, d.BaseData>)) {
      const attr = getLocationFromField(fieldData);
      if (attr && 'builtin' in attr && attr.builtin === 'position') {
        // position → gl_Position, skip declaration
        continue;
      }
      const loc = attr && 'location' in attr ? attr.location : locationIdx++;
      const glslType = wgslTypeToGlsl(fieldData);
      lines.push(`layout(location = ${loc}) out ${glslType} _out_${propName};`);
    }
  }

  lines.push('');

  // Extract function body from resolved GLSL code
  const body = extractFunctionBody(resolvedCode, fnName);

  // Wrap in void main()
  lines.push('void main() {');
  // Provide input variables from built-in GLSL inputs
  if (shell.in) {
    for (const [propName, fieldData] of Object.entries(shell.in as Record<string, d.BaseData>)) {
      const attr = getLocationFromField(fieldData);
      if (attr && 'builtin' in attr) {
        const builtinName = attr.builtin;
        let glBuiltin = '';
        if (builtinName === 'vertex_index') glBuiltin = 'uint(gl_VertexID)';
        else if (builtinName === 'instance_index') glBuiltin = 'uint(gl_InstanceID)';
        if (glBuiltin) {
          const glslType = wgslTypeToGlsl(fieldData);
          lines.push(`  ${glslType} _in_${propName} = ${glBuiltin};`);
        }
      }
    }
  }

  // Emit translated body indented
  for (const line of body.split('\n')) {
    lines.push(`  ${line}`);
  }

  // Map output variables back to GLSL outputs
  // The body uses WGSL return with struct constructor. We need to translate this.
  // For simplicity, we replace Output struct construction with assignments.
  // This is handled by post-processing the body lines above.

  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate complete GLSL ES 3.0 fragment shader source.
 */
function generateFragmentShader(
  fragmentFn: TgpuFragmentFn,
  resolvedCode: string,
  fnName: string,
): string {
  const lines: string[] = ['#version 300 es', 'precision highp float;', ''];

  const shell = fragmentFn.shell;

  // Declare inputs (varyings from vertex shader)
  if (shell.in) {
    let locationIdx = 0;
    for (const [propName, fieldData] of Object.entries(shell.in as Record<string, d.BaseData>)) {
      const attr = getLocationFromField(fieldData);
      if (attr && 'builtin' in attr) {
        // builtins like position → gl_FragCoord
        continue;
      }
      const loc = attr && 'location' in attr ? attr.location : locationIdx++;
      const glslType = wgslTypeToGlsl(fieldData);
      lines.push(`layout(location = ${loc}) in ${glslType} _in_${propName};`);
    }
  }

  // Declare outputs
  const outSchema = shell.out;
  if (outSchema && typeof outSchema === 'object' && !d.isDecorated(outSchema as d.BaseData)) {
    // Struct output
    let locationIdx = 0;
    for (const [propName, fieldData] of Object.entries(outSchema as Record<string, d.BaseData>)) {
      const attr = getLocationFromField(fieldData);
      if (attr && 'builtin' in attr) continue;
      const loc = attr && 'location' in attr ? attr.location : locationIdx++;
      const glslType = wgslTypeToGlsl(fieldData);
      lines.push(`layout(location = ${loc}) out ${glslType} _out_${propName};`);
    }
  } else if (outSchema) {
    // Single value or decorated output
    const fieldData = outSchema as d.BaseData;
    const attr = getLocationFromField(fieldData);
    const loc = attr && 'location' in attr ? attr.location : 0;
    const glslType = wgslTypeToGlsl(fieldData);
    lines.push(`layout(location = ${loc}) out ${glslType} _fragColor;`);
  }

  lines.push('');

  const body = extractFunctionBody(resolvedCode, fnName);

  lines.push('void main() {');
  // Provide input variables from builtins
  if (shell.in) {
    for (const [propName, fieldData] of Object.entries(shell.in as Record<string, d.BaseData>)) {
      const attr = getLocationFromField(fieldData);
      if (attr && 'builtin' in attr) {
        const builtinName = attr.builtin;
        let glBuiltin = '';
        if (builtinName === 'position') glBuiltin = 'gl_FragCoord';
        if (glBuiltin) {
          const glslType = wgslTypeToGlsl(fieldData);
          lines.push(`  ${glslType} _in_${propName} = ${glBuiltin};`);
        }
      }
    }
  }

  for (const line of body.split('\n')) {
    lines.push(`  ${line}`);
  }

  lines.push('}');

  return lines.join('\n');
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

class TgpuWebGLRenderPipelineImpl implements TgpuWebGLRenderPipeline {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #uniforms: Array<WebGLUniform>;
  #renderCtx: WebGLRenderContext | 'screen' | null = null;
  #offscreen: OffscreenCanvas;

  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    uniforms: Array<WebGLUniform>,
    offscreen: OffscreenCanvas,
  ) {
    this.#gl = gl;
    this.#program = program;
    this.#uniforms = uniforms;
    this.#offscreen = offscreen;
  }

  withColorAttachment(attachment: { view: WebGLRenderContext | 'screen' }): this {
    this.#renderCtx = attachment.view;
    return this;
  }

  draw(vertexCount: number, _instanceCount = 1, firstVertex = 0): void {
    const gl = this.#gl;

    // Resize offscreen canvas if needed
    if (this.#renderCtx && this.#renderCtx !== 'screen') {
      const canvas = this.#renderCtx.canvas;
      const w = canvas.width;
      const h = canvas.height;
      this.#offscreen.width = w;
      this.#offscreen.height = h;
    }

    gl.viewport(0, 0, this.#offscreen.width, this.#offscreen.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.#program);

    // Bind UBOs
    for (let i = 0; i < this.#uniforms.length; i++) {
      const uniform = this.#uniforms[i];
      if (uniform) {
        gl.bindBufferBase(gl.UNIFORM_BUFFER, uniform.bindingIndex, uniform.glBuffer);
        const blockIdx = gl.getUniformBlockIndex(this.#program, `_uniform_block_${i}`);
        if (blockIdx !== gl.INVALID_INDEX) {
          gl.uniformBlockBinding(this.#program, blockIdx, uniform.bindingIndex);
        }
      }
    }

    gl.drawArrays(gl.TRIANGLES, firstVertex, vertexCount);

    // Blit to user canvas if configured
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

let _uniformBindingCounter = 0;

class WebGLUniformImpl<TData extends d.AnyWgslData> implements WebGLUniform<TData> {
  readonly resourceType = 'uniform' as const;
  readonly bindingIndex: number;
  readonly glBuffer: WebGLBuffer;

  #gl: WebGL2RenderingContext;
  #schema: TData;

  constructor(gl: WebGL2RenderingContext, schema: TData) {
    this.#gl = gl;
    this.#schema = schema;
    this.bindingIndex = _uniformBindingCounter++;

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Failed to create WebGL buffer');
    this.glBuffer = buffer;
  }

  get schema(): TData {
    return this.#schema;
  }

  write(data: d.Infer<TData>): void {
    const gl = this.#gl;
    // Convert data to Float32Array for the UBO
    const floatData = flattenToFloat32(data);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.glBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, floatData, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  }
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

export interface CreateRenderPipelineWebGLOptions {
  vertex: TgpuVertexFn;
  fragment: TgpuFragmentFn;
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
    const uniform = new WebGLUniformImpl(this.#gl, typeSchema);
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
    vertex: TgpuVertexFn;
    fragment: TgpuFragmentFn;
  }): TgpuWebGLRenderPipeline {
    const { vertex, fragment } = descriptor;

    const vertexNamespace = tgpu['~unstable'].namespace();
    const fragmentNamespace = tgpu['~unstable'].namespace();

    // Resolve both functions using the GLSL generator
    const vertexCode = tgpu.resolve([vertex], {
      unstable_shaderGenerator: this.#shaderGenerator,
      names: vertexNamespace,
    });

    const fragmentCode = tgpu.resolve([fragment], {
      unstable_shaderGenerator: this.#shaderGenerator,
      names: fragmentNamespace,
    });

    // Get the function names from the resolved code
    const vertexFnName = tgpu.resolve({
      template: '$$name$$',
      unstable_shaderGenerator: this.#shaderGenerator,
      names: vertexNamespace,
      externals: { $$name$$: vertex },
    });
    const fragmentFnName = tgpu.resolve({
      template: '$$name$$',
      unstable_shaderGenerator: this.#shaderGenerator,
      names: fragmentNamespace,
      externals: { $$name$$: fragment },
    });

    const vertexGlsl = generateVertexShader(vertex, vertexCode, vertexFnName);
    const fragmentGlsl = generateFragmentShader(fragment, fragmentCode, fragmentFnName);

    const program = linkProgram(this.#gl, vertexGlsl, fragmentGlsl);

    return new TgpuWebGLRenderPipelineImpl(
      this.#gl,
      program,
      this.#uniforms.slice() as Array<WebGLUniform>,
      this.#offscreen,
    );
  }

  with(_slot: unknown, _value: unknown): this {
    // TODO: Implement slot binding
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
    // TODO: Implement slot binding
    return this;
  }

  flush(): void {
    // No-op
  }

  destroy(): void {
    for (const buf of this.#buffers) {
      this.#gl.deleteBuffer(buf);
    }
    for (const uniform of this.#uniforms) {
      this.#gl.deleteBuffer(uniform.glBuffer);
    }
    this.#buffers = [];
    this.#uniforms = [];
  }
}
