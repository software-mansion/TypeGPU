import { callableSchema } from '../core/function/createCallableSchema.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { $internal, $repr } from '../shared/symbols.ts';
import { bool, f16, f32, i32, u32 } from './numeric.ts';
import {
  Vec2bImpl,
  Vec2fImpl,
  Vec2hImpl,
  Vec2iImpl,
  Vec2uImpl,
  Vec3bImpl,
  Vec3fImpl,
  Vec3hImpl,
  Vec3iImpl,
  Vec3uImpl,
  Vec4bImpl,
  Vec4fImpl,
  Vec4hImpl,
  Vec4iImpl,
  Vec4uImpl,
  type VecBase,
} from './vectorImpl.ts';
import type {
  AnyVecInstance,
  BaseData,
  Bool,
  F16,
  F32,
  I32,
  U32,
  Vec2b,
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3b,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4b,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
} from './wgslTypes.ts';
import { isVec } from './wgslTypes.ts';

// ----------
// Public API
// ----------

/**
 * Schema representing vec2f - a vector with 2 elements of type f32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2f(); // (0.0, 0.0)
 * const vector = d.vec2f(1); // (1.0, 1.0)
 * const vector = d.vec2f(0.5, 0.1); // (0.5, 0.1)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2f, d.vec2f(0, 1)); // buffer holding a d.vec2f value, with an initial value of vec2f(0, 1);
 */
export const vec2f = makeVecSchema(Vec2fImpl, f32) as Vec2f;

/**
 * Schema representing vec2h - a vector with 2 elements of type f16.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2h(); // (0.0, 0.0)
 * const vector = d.vec2h(1); // (1.0, 1.0)
 * const vector = d.vec2h(0.5, 0.1); // (0.5, 0.1)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2h, d.vec2h(0, 1)); // buffer holding a d.vec2h value, with an initial value of vec2h(0, 1);
 */
export const vec2h = makeVecSchema(Vec2hImpl, f16) as Vec2h;

/**
 * Schema representing vec2i - a vector with 2 elements of type i32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2i(); // (0, 0)
 * const vector = d.vec2i(1); // (1, 1)
 * const vector = d.vec2i(-1, 1); // (-1, 1)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2i, d.vec2i(0, 1)); // buffer holding a d.vec2i value, with an initial value of vec2i(0, 1);
 */
export const vec2i = makeVecSchema(Vec2iImpl, i32) as Vec2i;

/**
 * Schema representing vec2u - a vector with 2 elements of type u32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2u(); // (0, 0)
 * const vector = d.vec2u(1); // (1, 1)
 * const vector = d.vec2u(1, 2); // (1, 2)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2u, d.vec2u(0, 1)); // buffer holding a d.vec2u value, with an initial value of vec2u(0, 1);
 */
export const vec2u = makeVecSchema(Vec2uImpl, u32) as Vec2u;

/**
 * Schema representing `vec2<bool>` - a vector with 2 elements of type `bool`.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2b(); // (false, false)
 * const vector = d.vec2b(true); // (true, true)
 * const vector = d.vec2b(false, true); // (false, true)
 */
export const vec2b = makeVecSchema(Vec2bImpl, bool) as Vec2b;

/**
 * Schema representing vec3f - a vector with 3 elements of type f32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3f(); // (0.0, 0.0, 0.0)
 * const vector = d.vec3f(1); // (1.0, 1.0, 1.0)
 * const vector = d.vec3f(1, 2, 3.5); // (1.0, 2.0, 3.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3f, d.vec3f(0, 1, 2)); // buffer holding a d.vec3f value, with an initial value of vec3f(0, 1, 2);
 */
export const vec3f = makeVecSchema(Vec3fImpl, f32) as Vec3f;

/**
 * Schema representing vec3h - a vector with 3 elements of type f16.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3h(); // (0.0, 0.0, 0.0)
 * const vector = d.vec3h(1); // (1.0, 1.0, 1.0)
 * const vector = d.vec3h(1, 2, 3.5); // (1.0, 2.0, 3.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3h, d.vec3h(0, 1, 2)); // buffer holding a d.vec3h value, with an initial value of vec3h(0, 1, 2);
 */
export const vec3h = makeVecSchema(Vec3hImpl, f16) as Vec3h;

/**
 * Schema representing vec3i - a vector with 3 elements of type i32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3i(); // (0, 0, 0)
 * const vector = d.vec3i(1); // (1, 1, 1)
 * const vector = d.vec3i(1, 2, -3); // (1, 2, -3)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3i, d.vec3i(0, 1, 2)); // buffer holding a d.vec3i value, with an initial value of vec3i(0, 1, 2);
 */
export const vec3i = makeVecSchema(Vec3iImpl, i32) as Vec3i;

/**
 * Schema representing vec3u - a vector with 3 elements of type u32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3u(); // (0, 0, 0)
 * const vector = d.vec3u(1); // (1, 1, 1)
 * const vector = d.vec3u(1, 2, 3); // (1, 2, 3)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3u, d.vec3u(0, 1, 2)); // buffer holding a d.vec3u value, with an initial value of vec3u(0, 1, 2);
 */
export const vec3u = makeVecSchema(Vec3uImpl, u32) as Vec3u;

/**
 * Schema representing `vec3<bool>` - a vector with 3 elements of type `bool`.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3b(); // (false, false, false)
 * const vector = d.vec3b(true); // (true, true, true)
 * const vector = d.vec3b(false, true, false); // (false, true, false)
 */
export const vec3b = makeVecSchema(Vec3bImpl, bool) as Vec3b;

/**
 * Schema representing vec4f - a vector with 4 elements of type f32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4f(); // (0.0, 0.0, 0.0, 0.0)
 * const vector = d.vec4f(1); // (1.0, 1.0, 1.0, 1.0)
 * const vector = d.vec4f(1, 2, 3, 4.5); // (1.0, 2.0, 3.0, 4.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4f, d.vec4f(0, 1, 2, 3)); // buffer holding a d.vec4f value, with an initial value of vec4f(0, 1, 2, 3);
 */
export const vec4f = makeVecSchema(Vec4fImpl, f32) as Vec4f;

/**
 * Schema representing vec4h - a vector with 4 elements of type f16.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4h(); // (0.0, 0.0, 0.0, 0.0)
 * const vector = d.vec4h(1); // (1.0, 1.0, 1.0, 1.0)
 * const vector = d.vec4h(1, 2, 3, 4.5); // (1.0, 2.0, 3.0, 4.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4h, d.vec4h(0, 1, 2, 3)); // buffer holding a d.vec4h value, with an initial value of vec4h(0, 1, 2, 3);
 */
export const vec4h = makeVecSchema(Vec4hImpl, f16) as Vec4h;

/**
 * Schema representing vec4i - a vector with 4 elements of type i32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4i(); // (0, 0, 0, 0)
 * const vector = d.vec4i(1); // (1, 1, 1, 1)
 * const vector = d.vec4i(1, 2, 3, -4); // (1, 2, 3, -4)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4i, d.vec4i(0, 1, 2, 3)); // buffer holding a d.vec4i value, with an initial value of vec4i(0, 1, 2, 3);
 */
export const vec4i = makeVecSchema(Vec4iImpl, i32) as Vec4i;

/**
 * Schema representing vec4u - a vector with 4 elements of type u32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4u(); // (0, 0, 0, 0)
 * const vector = d.vec4u(1); // (1, 1, 1, 1)
 * const vector = d.vec4u(1, 2, 3, 4); // (1, 2, 3, 4)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4u, d.vec4u(0, 1, 2, 3)); // buffer holding a d.vec4u value, with an initial value of vec4u(0, 1, 2, 3);
 */
export const vec4u = makeVecSchema(Vec4uImpl, u32) as Vec4u;

/**
 * Schema representing `vec4<bool>` - a vector with 4 elements of type `bool`.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4b(); // (false, false, false, false)
 * const vector = d.vec4b(true); // (true, true, true, true)
 * const vector = d.vec4b(false, true, false, true); // (false, true, false, true)
 */
export const vec4b = makeVecSchema(Vec4bImpl, bool) as Vec4b;

// --------------
// Implementation
// --------------

export const vecTypeToConstructor = {
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  'vec2<bool>': vec2b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  'vec3<bool>': vec3b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
  'vec4<bool>': vec4b,
} as const;

type VecSchemaBase<TValue> = {
  readonly type: string;
  readonly componentCount: 2 | 3 | 4;
  readonly [$repr]: TValue;
};

function makeVecSchema<TValue, S extends number | boolean>(
  VecImpl: new (...args: S[]) => VecBase<S>,
  primitive: F32 | F16 | I32 | U32 | Bool,
): VecSchemaBase<TValue> & ((...args: (S | AnyVecInstance)[]) => TValue) {
  const { kind: type, length } = new VecImpl();
  const componentCount = length as 2 | 3 | 4;

  const cpuConstruct = (...args: (S | AnyVecInstance)[]): TValue => {
    const values: S[] = Array.from({ length: args.length });

    let j = 0;
    for (const arg of args) {
      if (typeof arg === 'number' || typeof arg === 'boolean') {
        values[j++] = arg;
      } else {
        for (let c = 0; c < arg.length; ++c) {
          values[j++] = arg[c] as S;
        }
      }
    }

    if (values.length <= 1 || values.length === componentCount) {
      return new VecImpl(...values) as TValue;
    }

    throw new Error(`'${type}' constructor called with invalid number of arguments.`);
  };

  const construct = callableSchema({
    name: type,
    signature: (...args) => ({
      argTypes: args.map((arg) => (isVec(arg) ? arg : primitive)),
      returnType: schema as unknown as BaseData,
    }),
    normalImpl: cpuConstruct,
    codegenImpl: (_ctx, args) => {
      if (args.length === 1 && args[0]?.dataType === (schema as unknown as BaseData)) {
        // Already typed as the schema
        return stitch`${args[0]}`;
      }
      return stitch`${type}(${args})`;
    },
  });

  const schema: VecSchemaBase<TValue> & ((...args: (S | AnyVecInstance)[]) => TValue) =
    Object.assign(construct, {
      [$internal]: {},
      type,
      primitive,
      componentCount,
      [$repr]: undefined as TValue,
    });

  // TODO: Remove workaround
  // it's a workaround for circular dependencies caused by us using schemas in the shader generator
  VecImpl.prototype.schema = schema;

  return schema;
}
