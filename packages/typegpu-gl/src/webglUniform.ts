import {
  d,
  patchArrayBuffer,
  readFromArrayBuffer,
  writeToArrayBuffer,
  type BufferInitialData,
  type BufferWriteOptions,
  type TgpuBuffer,
} from 'typegpu';
import { getName, makeDereferenceable, makeResolvable, setName, snip } from 'typegpu/~internal';

import { WebGLFallbackUnsupportedError } from './errors.ts';
import { getCrossShaderStageState } from './glslGenerator.ts';

export interface WebGLUniform<TData extends d.AnyWgslData = d.AnyWgslData> {
  readonly resourceType: 'uniform';
  readonly dataType: TData;
  write(data: d.Infer<TData>): void;

  readonly $: d.InferGPU<TData>;

  /** @internal The latest ArrayBuffer representation of the written data */
  readonly buffer: ArrayBuffer;
}

export type UniformSetter = (
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  data: ArrayBuffer,
) => void;

export function uniformSetterFor(schema: d.AnyWgslData): UniformSetter {
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
  return () => {};
}

export class WebGLUniformImpl<TData extends d.AnyWgslData> implements WebGLUniform<TData> {
  readonly resourceType = 'uniform' as const;

  readonly #initial: BufferInitialData<TData> | undefined;

  readonly dataType: TData;
  readonly buffer: ArrayBuffer;

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
    this.buffer = new ArrayBuffer(d.sizeOf(dataType));

    if (this.#initial !== undefined) {
      const initialData =
        typeof this.#initial === 'function'
          ? (this.#initial as (buffer: this) => d.InferInput<TData>)(this)
          : (this.#initial as d.InferInput<TData>);
      writeToArrayBuffer(this.buffer, this.dataType, initialData);
    }
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  write(data: d.InferInput<TData>, options?: BufferWriteOptions): void {
    writeToArrayBuffer(this.buffer, this.dataType, data, options);
  }

  public patch(data: d.InferPatch<TData>): void {
    patchArrayBuffer(this.buffer, this.dataType, data);
  }

  public clear(): void {
    new Uint8Array(this.buffer).fill(0);
  }

  copyFrom(_srcBuffer: TgpuBuffer<d.MemIdentity<TData>>): void {
    throw new WebGLFallbackUnsupportedError('.copyFrom()');
  }

  read(): Promise<d.Infer<TData>> {
    return Promise.resolve(readFromArrayBuffer(this.buffer, this.dataType));
  }

  destroy() {
    // No-op
  }
}
