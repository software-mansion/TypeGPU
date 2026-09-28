import { d, type BufferWriteOptions } from 'typegpu';
import { getName, makeDereferenceable, makeResolvable, setName, snip } from 'typegpu/~internal';

import { WebGLFallbackUnsupportedError } from './errors.ts';
import { getCrossShaderStageState } from './glslGenerator.ts';
import type { WebGLBufferImpl } from './webglBuffer.ts';

/**
 * Uploads a uniform's data (in its WGSL memory layout) to the program it was planned for.
 */
export type UniformUpload = (gl: WebGL2RenderingContext, data: ArrayBuffer) => void;

/** `h` is f16, uploaded as floats, since GLSL ES 3.00 has no half-precision uniforms */
type ScalarKind = 'f' | 'h' | 'i' | 'ui';

interface LeafType {
  readonly kind: ScalarKind;
  /** Scalars/vectors: 1, matrices: the number of columns */
  readonly columns: number;
  /** Scalars/vectors: component count, matrices: rows (components per column) */
  readonly rows: number;
  /** Byte distance between columns in the WGSL layout */
  readonly columnStride: number;
}

const leafTypes: Record<string, LeafType> = {
  f32: { kind: 'f', columns: 1, rows: 1, columnStride: 0 },
  vec2f: { kind: 'f', columns: 1, rows: 2, columnStride: 0 },
  vec3f: { kind: 'f', columns: 1, rows: 3, columnStride: 0 },
  vec4f: { kind: 'f', columns: 1, rows: 4, columnStride: 0 },
  f16: { kind: 'h', columns: 1, rows: 1, columnStride: 0 },
  vec2h: { kind: 'h', columns: 1, rows: 2, columnStride: 0 },
  vec3h: { kind: 'h', columns: 1, rows: 3, columnStride: 0 },
  vec4h: { kind: 'h', columns: 1, rows: 4, columnStride: 0 },
  i32: { kind: 'i', columns: 1, rows: 1, columnStride: 0 },
  vec2i: { kind: 'i', columns: 1, rows: 2, columnStride: 0 },
  vec3i: { kind: 'i', columns: 1, rows: 3, columnStride: 0 },
  vec4i: { kind: 'i', columns: 1, rows: 4, columnStride: 0 },
  u32: { kind: 'ui', columns: 1, rows: 1, columnStride: 0 },
  vec2u: { kind: 'ui', columns: 1, rows: 2, columnStride: 0 },
  vec3u: { kind: 'ui', columns: 1, rows: 3, columnStride: 0 },
  vec4u: { kind: 'ui', columns: 1, rows: 4, columnStride: 0 },
  // Matrix columns are aligned like vectors: vec3f columns take 16 bytes
  mat2x2f: { kind: 'f', columns: 2, rows: 2, columnStride: 8 },
  mat3x3f: { kind: 'f', columns: 3, rows: 3, columnStride: 16 },
  mat4x4f: { kind: 'f', columns: 4, rows: 4, columnStride: 16 },
};

/**
 * A scalar, vector or matrix, or an array of them: something that can be uploaded
 * with a single `gl.uniform*v()` call.
 */
interface UniformLeaf {
  /** The GLSL expression that names it, e.g. `lights[2].color` */
  readonly path: string;
  readonly type: LeafType;
  readonly offset: number;
  readonly count: number;
  /** Byte distance between array elements in the WGSL layout */
  readonly stride: number;
}

function stringifyType(schema: d.BaseData): string {
  return (schema as { type: string }).type;
}

function undecorate(schema: d.BaseData): d.BaseData {
  return d.isDecorated(schema) ? schema.inner : schema;
}

function collectLeaves(schema: d.BaseData, path: string, offset: number, out: UniformLeaf[]) {
  const data = undecorate(schema);
  const leafType = leafTypes[stringifyType(data)];
  if (leafType) {
    out.push({ path, type: leafType, offset, count: 1, stride: 0 });
    return;
  }

  if (d.isWgslArray(data)) {
    const elementType = undecorate(data.elementType);
    const stride = d.memoryLayoutOf(data, (array) => array[1]).offset;
    const elementLeafType = leafTypes[stringifyType(elementType)];
    if (elementLeafType) {
      // The location of an array is the location of its first element, and one
      // `uniform*v()` call can fill all of its elements.
      out.push({ path, type: elementLeafType, offset, count: data.elementCount, stride });
      return;
    }
    if (d.isWgslArray(elementType)) {
      throw new WebGLFallbackUnsupportedError(
        'uniform arrays of arrays',
        'GLSL ES 3.00 has no arrays of arrays',
      );
    }
    for (let i = 0; i < data.elementCount; i++) {
      collectLeaves(elementType, `${path}[${i}]`, offset + i * stride, out);
    }
    return;
  }

  if (d.isWgslStruct(data)) {
    for (const [key, propType] of Object.entries(data.propTypes)) {
      const propOffset = d.memoryLayoutOf(
        data,
        (struct) => (struct as Record<string, unknown>)[key],
      );
      collectLeaves(propType, `${path}.${key}`, offset + propOffset.offset, out);
    }
    return;
  }

  throw new WebGLFallbackUnsupportedError(`uniforms of type ${stringifyType(data)}`);
}

type UniformSetter = (
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  values: Float32Array | Int32Array | Uint32Array,
) => void;

const uniformSetters: Record<string, UniformSetter> = {
  '1f': (gl, loc, values) => gl.uniform1fv(loc, values as Float32Array),
  '2f': (gl, loc, values) => gl.uniform2fv(loc, values as Float32Array),
  '3f': (gl, loc, values) => gl.uniform3fv(loc, values as Float32Array),
  '4f': (gl, loc, values) => gl.uniform4fv(loc, values as Float32Array),
  '1i': (gl, loc, values) => gl.uniform1iv(loc, values as Int32Array),
  '2i': (gl, loc, values) => gl.uniform2iv(loc, values as Int32Array),
  '3i': (gl, loc, values) => gl.uniform3iv(loc, values as Int32Array),
  '4i': (gl, loc, values) => gl.uniform4iv(loc, values as Int32Array),
  '1ui': (gl, loc, values) => gl.uniform1uiv(loc, values as Uint32Array),
  '2ui': (gl, loc, values) => gl.uniform2uiv(loc, values as Uint32Array),
  '3ui': (gl, loc, values) => gl.uniform3uiv(loc, values as Uint32Array),
  '4ui': (gl, loc, values) => gl.uniform4uiv(loc, values as Uint32Array),
  mat2: (gl, loc, values) => gl.uniformMatrix2fv(loc, false, values as Float32Array),
  mat3: (gl, loc, values) => gl.uniformMatrix3fv(loc, false, values as Float32Array),
  mat4: (gl, loc, values) => gl.uniformMatrix4fv(loc, false, values as Float32Array),
};

function halfToFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function uploadLeaf(
  location: WebGLUniformLocation,
  { type, offset, count, stride }: UniformLeaf,
): UniformUpload {
  const { kind, columns, rows, columnStride } = type;
  const isHalf = kind === 'h';
  const TypedArray =
    kind === 'f' || isHalf ? Float32Array : kind === 'i' ? Int32Array : Uint32Array;
  const bytesPerComponent = isHalf ? 2 : 4;
  const valuesPerElement = columns * rows;
  const length = count * valuesPerElement;

  const setter = uniformSetters[columns > 1 ? `mat${columns}` : `${rows}${isHalf ? 'f' : kind}`];
  if (!setter) {
    throw new Error(`Internal error: no uniform setter for '${columns}x${rows}${kind}'`);
  }
  const upload = (gl: WebGL2RenderingContext, values: Float32Array | Int32Array | Uint32Array) =>
    setter(gl, location, values);

  // When the WGSL layout has no padding, the data can be passed as is
  const isTight =
    !isHalf &&
    (columns === 1 || columnStride === rows * 4) &&
    (count === 1 || stride === valuesPerElement * 4);
  if (isTight) {
    return (gl, data) => upload(gl, new TypedArray(data, offset, length));
  }

  // Otherwise, it's packed tightly (and halves are converted) into a scratch array first
  const scratch = new TypedArray(length);
  return (gl, data) => {
    const source = isHalf ? new Uint16Array(data) : new TypedArray(data);
    let i = 0;
    for (let element = 0; element < count; element++) {
      for (let column = 0; column < columns; column++) {
        const start = (offset + element * stride + column * columnStride) / bytesPerComponent;
        for (let row = 0; row < rows; row++) {
          const value = source[start + row] as number;
          scratch[i++] = isHalf ? halfToFloat(value) : value;
        }
      }
    }
    upload(gl, scratch);
  };
}

/**
 * Plans how to upload a uniform of the given schema, declared as `name` in `program`.
 * Structs are uploaded member by member (`name.member`, `name[i].member`), since GLSL
 * uniforms outside of uniform blocks have a location per member.
 */
export function planUniformUploads(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  schema: d.BaseData,
): UniformUpload[] {
  const leaves: UniformLeaf[] = [];
  collectLeaves(schema, name, 0, leaves);

  return leaves.flatMap((leaf) => {
    const location = gl.getUniformLocation(program, leaf.path);
    // Not used by the shaders
    return location === null ? [] : [uploadLeaf(location, leaf)];
  });
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
