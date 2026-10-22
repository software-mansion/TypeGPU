import { d, type BufferWriteOptions } from 'typegpu';
import { getName, makeDereferenceable, makeResolvable, setName, snip } from 'typegpu/~internal';

import { getCrossShaderStageState } from './glslGenerator.ts';
import type { WebGLBufferImpl } from './webglBuffer.ts';

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

/**
 * A uniform binding of a buffer, like the ones returned by `root.createUniform()` and
 * `buffer.as('uniform')` in the WebGPU root. Its data is uploaded on every draw that
 * uses it, with `gl.uniform*()` calls.
 */
export class WebGLUniformImpl<TData extends d.AnyWgslData> {
  readonly resourceType = 'uniform' as const;
  readonly buffer: WebGLBufferImpl<TData>;

  declare readonly $: d.InferGPU<TData>;

  static {
    makeDereferenceable(
      makeResolvable(WebGLUniformImpl.prototype, {
        resolve(ctx) {
          const crossShaderStageState = getCrossShaderStageState(ctx);

          let id = crossShaderStageState.globalIdentifierMap.get(this);
          if (!id) {
            id = ctx.makeUniqueIdentifier(getName(this) ?? getName(this.buffer), 'global');
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

  constructor(buffer: WebGLBufferImpl<TData>) {
    this.buffer = buffer;
  }

  get dataType(): TData {
    return this.buffer.dataType;
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  write(data: d.InferInput<TData>, options?: BufferWriteOptions): void {
    this.buffer.write(data, options);
  }

  /** @deprecated Use {@link patch} instead. */
  writePartial(data: unknown): void {
    this.buffer.writePartial(data);
  }

  patch(data: d.InferPatch<TData>): void {
    this.buffer.patch(data);
  }

  read(): Promise<d.Infer<TData>> {
    return this.buffer.read();
  }
}
