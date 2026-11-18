import { UniformGroup, type UNIFORM_TYPES } from 'pixi.js';
import type { d } from 'typegpu';
import { getShaderTarget } from './internal/context.ts';

/** The types a uniform can have: the ones PixiJS can upload */
export type UniformSchema =
  | d.F32
  | d.I32
  | d.U32
  | d.Vec2f
  | d.Vec3f
  | d.Vec4f
  | d.Vec2i
  | d.Vec3i
  | d.Vec4i
  | d.Vec2u
  | d.Vec3u
  | d.Vec4u
  | d.Mat2x2f
  | d.Mat3x3f
  | d.Mat4x4f;

export type UniformRecord = Record<string, UniformSchema>;

/** What a shader reads through `uniforms.$` */
export type UniformValues<T extends UniformRecord> = {
  readonly [K in keyof T]: d.InferGPU<T[K]>;
};

/** What `uniforms.write` accepts: numbers, TypeGPU vectors and matrices, or plain arrays */
export type UniformInput<T extends UniformRecord> = {
  [K in keyof T]?: d.Infer<T[K]> | ArrayLike<number>;
};

/**
 * Something that holds the values of a set of uniforms:
 * - a PixiJS 3D material (anything with `data`), for uniforms of a shader bit
 * - a filter made by `createFilter`, or a post effect made by `postEffect`
 * - a PixiJS `UniformGroup` made by `uniforms.createGroup`
 */
export type UniformTarget = UniformGroup | { readonly data: object } | object;

const pixiTypes: Record<string, UNIFORM_TYPES> = {
  f32: 'f32',
  i32: 'i32',
  u32: 'u32' as UNIFORM_TYPES,
  vec2f: 'vec2<f32>',
  vec3f: 'vec3<f32>',
  vec4f: 'vec4<f32>',
  vec2i: 'vec2<i32>',
  vec3i: 'vec3<i32>',
  vec4i: 'vec4<i32>',
  vec2u: 'vec2<u32>' as UNIFORM_TYPES,
  vec3u: 'vec3<u32>' as UNIFORM_TYPES,
  vec4u: 'vec4<u32>' as UNIFORM_TYPES,
  mat2x2f: 'mat2x2<f32>',
  mat3x3f: 'mat3x3<f32>',
  mat4x4f: 'mat4x4<f32>',
};

const componentCounts: Record<string, number> = {
  f32: 1,
  i32: 1,
  u32: 1,
  vec2f: 2,
  vec3f: 3,
  vec4f: 4,
  vec2i: 2,
  vec3i: 3,
  vec4i: 4,
  vec2u: 2,
  vec3u: 3,
  vec4u: 4,
  mat2x2f: 4,
  mat3x3f: 9,
  mat4x4f: 16,
};

/** The name PixiJS uses for a TypeGPU schema, e.g. `'vec3<f32>'` for `d.vec3f` */
export function toPixiType(schema: UniformSchema): UNIFORM_TYPES {
  const type = pixiTypes[schema.type];
  if (!type) {
    throw new Error(
      `[@typegpu/pixi] '${String(schema.type)}' can't be a uniform. Use f32, i32, u32, a vector of those, or a mat2x2f, mat3x3f or mat4x4f.`,
    );
  }
  return type;
}

function isScalar(schema: UniformSchema): boolean {
  return componentCounts[schema.type] === 1;
}

function toNumbers(schema: UniformSchema, key: string, value: unknown): number[] {
  const count = componentCounts[schema.type] as number;
  const numbers = Array.from(value as ArrayLike<number>);

  // A mat3x3f stores each column padded to four floats, but PixiJS wants nine
  if (schema.type === 'mat3x3f' && numbers.length === 12) {
    numbers.splice(11, 1);
    numbers.splice(7, 1);
    numbers.splice(3, 1);
  }

  if (numbers.length !== count) {
    throw new Error(
      `[@typegpu/pixi] Uniform '${key}' is a ${schema.type}, which takes ${count} numbers, but got ${numbers.length}.`,
    );
  }
  return numbers;
}

/** Converts a value to what a PixiJS `UniformGroup` stores */
function toGroupValue(schema: UniformSchema, key: string, value: unknown) {
  if (isScalar(schema)) {
    return value as number;
  }
  const numbers = toNumbers(schema, key, value);
  if (schema.type.endsWith('i')) return new Int32Array(numbers);
  if (schema.type.endsWith('u')) return new Uint32Array(numbers);
  return new Float32Array(numbers);
}

function zero(schema: UniformSchema): number | number[] {
  return isScalar(schema)
    ? 0
    : Array.from<number>({ length: componentCounts[schema.type] as number }).fill(0);
}

const targetGroups = new WeakMap<object, Map<PixiUniforms<UniformRecord>, UniformGroup>>();

/**
 * Remembers which `UniformGroup` holds the values of `uniforms` for `target`,
 * so that `uniforms.write(target, ...)` can find it.
 * @internal
 */
export function registerUniformGroup(
  target: object,
  uniforms: PixiUniforms<UniformRecord>,
  group: UniformGroup,
) {
  let groups = targetGroups.get(target);
  if (!groups) {
    groups = new Map();
    targetGroups.set(target, groups);
  }
  groups.set(uniforms, group);
}

/**
 * A set of uniforms, declared once with TypeGPU schemas.
 *
 * Shaders read them through `.$`, and JavaScript writes them with `.write`.
 * Pass it as `uniforms` to `createFilter`, `shaderBit`, `effectFragment` or `postEffect`.
 */
export class PixiUniforms<T extends UniformRecord> {
  readonly schema: T;
  readonly #values: UniformValues<T>;

  constructor(schema: T) {
    this.schema = schema;

    const values = {};
    for (const key of Object.keys(schema)) {
      toPixiType(schema[key] as UniformSchema); // throws on types PixiJS can't upload
      Object.defineProperty(values, key, {
        enumerable: true,
        get: () =>
          getShaderTarget(`The uniform '${key}'`).uniformField(
            this as unknown as PixiUniforms<UniformRecord>,
            key,
          ),
      });
    }
    this.#values = values as UniformValues<T>;
  }

  /** The uniforms' values. Only readable inside a `'use gpu'` function. */
  get $(): UniformValues<T> {
    return this.#values;
  }

  /** The field types as PixiJS names them, e.g. `{ strength: 'f32' }` */
  get pixiTypes(): Record<keyof T & string, UNIFORM_TYPES> {
    return Object.fromEntries(
      Object.entries(this.schema).map(([key, schema]) => [key, toPixiType(schema)]),
    ) as Record<keyof T & string, UNIFORM_TYPES>;
  }

  /**
   * Creates a PixiJS `UniformGroup` with a uniform for each field.
   * Fields that `initial` leaves out start at zero.
   */
  createGroup(initial?: UniformInput<T>): UniformGroup {
    const entries = Object.entries(this.schema).map(([key, schema]) => [
      key,
      {
        type: toPixiType(schema),
        value: toGroupValue(schema, key, initial?.[key] ?? zero(schema)),
      },
    ]);
    const group = new UniformGroup(Object.fromEntries(entries));
    registerUniformGroup(group, this as unknown as PixiUniforms<UniformRecord>, group);
    return group;
  }

  /**
   * Sets some or all of the uniforms on `target`.
   *
   * @param target A PixiJS 3D material that has a shader bit using these uniforms,
   *   a filter from `createFilter`, a post effect from `postEffect`, or a group from `createGroup`.
   *
   * @example
   * ```ts
   * contourUniforms.write(material, { frequency: 4, highColor: d.vec3f(1) });
   * ```
   */
  write(target: UniformTarget, values: UniformInput<T>): void {
    const group = targetGroups.get(target)?.get(this as unknown as PixiUniforms<UniformRecord>);

    if (group) {
      for (const key of Object.keys(values)) {
        const schema = this.#schemaOf(key);
        group.uniforms[key] = toGroupValue(schema, key, values[key]);
      }
      group.update();
      return;
    }

    const data = (target as { data?: Record<string, unknown> }).data;
    if (data && typeof data === 'object') {
      // A PixiJS 3D material. Assigning to a field of `data` queues the upload.
      for (const key of Object.keys(values)) {
        const schema = this.#schemaOf(key);
        data[key] = isScalar(schema) ? values[key] : toNumbers(schema, key, values[key]);
      }
      return;
    }

    throw new Error(
      "[@typegpu/pixi] Can't write uniforms to this object. Pass a PixiJS 3D material, or a filter, post effect or uniform group that was created with these uniforms.",
    );
  }

  #schemaOf(key: string): UniformSchema {
    const schema = this.schema[key];
    if (!schema) {
      throw new Error(
        `[@typegpu/pixi] There's no uniform named '${key}'. Declared: ${Object.keys(this.schema).join(', ')}.`,
      );
    }
    return schema;
  }
}

/**
 * Declares a set of uniforms with TypeGPU schemas.
 *
 * @example
 * ```ts
 * const vignetteUniforms = uniforms({ strength: d.f32, tint: d.vec3f });
 *
 * const effect = (uv: d.v2f) => {
 *   'use gpu';
 *   const strength = vignetteUniforms.$.strength; // typed as a number
 *   // ...
 * };
 * ```
 */
export function uniforms<T extends UniformRecord>(schema: T): PixiUniforms<T> {
  return new PixiUniforms(schema);
}
