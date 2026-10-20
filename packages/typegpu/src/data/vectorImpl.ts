import { $internal, $resolve } from '../shared/symbols.ts';
import { numericLiteralToSnippet } from '../tgsl/generationHelpers.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';
import {
  bool,
  castToBool,
  castToF16,
  castToF32,
  castToI32,
  castToU32,
  f16,
  f32,
  i32,
  u32,
} from './numeric.ts';
import { type ResolvedSnippet } from './snippet.ts';
import { WORKAROUND_getSchema, type BaseData, type VecKind } from './wgslTypes.ts';

type ElementSchema<S> = BaseData & ((v?: S) => S);

// Shared between all instances, so that casting elements doesn't allocate
const boolInternal = { elementSchema: bool, cast: castToBool };
const f16Internal = { elementSchema: f16, cast: castToF16 };
const f32Internal = { elementSchema: f32, cast: castToF32 };
const i32Internal = { elementSchema: i32, cast: castToI32 };
const u32Internal = { elementSchema: u32, cast: castToU32 };

const XYZW = ['x', 'y', 'z', 'w'];
const RGBA = ['r', 'g', 'b', 'a'];

/**
 * The components of a vector as a plain array, read by name, which is much faster than
 * reading them by index (see the note on swizzles in `VecBase`).
 */
export function vecComponents<S>(v: VecBase<S>): S[] {
  const named = v as unknown as { x: S; y: S; z: S; w: S };
  if (v.length === 2) {
    return [named.x, named.y];
  }
  if (v.length === 3) {
    return [named.x, named.y, named.z];
  }
  return [named.x, named.y, named.z, named.w];
}

export abstract class VecBase<S> extends Array implements SelfResolvable {
  abstract readonly [$internal]: {
    elementSchema: ElementSchema<S>;
    /** Casts a value to the element type, without going through the schema's callable wrapper */
    cast: (v?: S) => S;
  };
  abstract get kind(): VecKind;

  abstract get _Vec2(): new (x: S, y: S) => Vec2<S>;
  abstract get _Vec3(): new (x: S, y: S, z: S) => Vec3<S>;
  abstract get _Vec4(): new (x: S, y: S, z: S, w: S) => Vec4<S>;

  static {
    // Swizzles read components by name (`this.x`), since reading a vector by index (`this[0]`)
    // goes through the index accessors defined on the subclasses, which engines handle on a
    // much slower path.
    type Named = VecBase<unknown> & Record<string, unknown>;

    const defineSwizzle = (indices: number[]) => {
      const names = indices.map((i) => XYZW[i] as string);
      const [a, b, c, d] = names as [string, string, string, string];
      const get =
        indices.length === 2
          ? function (this: Named) {
              return new this._Vec2(this[a], this[b]);
            }
          : indices.length === 3
            ? function (this: Named) {
                return new this._Vec3(this[a], this[b], this[c]);
              }
            : function (this: Named) {
                return new this._Vec4(this[a], this[b], this[c], this[d]);
              };

      Object.defineProperty(VecBase.prototype, names.join(''), { get });
      Object.defineProperty(VecBase.prototype, indices.map((i) => RGBA[i]).join(''), { get });
    };

    for (let e0 = 0; e0 < 4; e0++) {
      for (let e1 = 0; e1 < 4; e1++) {
        defineSwizzle([e0, e1]);
        for (let e2 = 0; e2 < 4; e2++) {
          defineSwizzle([e0, e1, e2]);
          for (let e3 = 0; e3 < 4; e3++) {
            defineSwizzle([e0, e1, e2, e3]);
          }
        }
      }
    }
  }

  castElement(): (v?: S) => S {
    return this[$internal].cast;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    // oxlint-disable-next-line typescript-eslint(no-explicit-any)
    const vecSchema = WORKAROUND_getSchema(this as any);
    // Boolean components also go through numericLiteralToSnippet
    const components = vecComponents(this) as number[];
    const first = components[0] as number;

    if (components.every((e) => !e)) {
      return ctx.gen.typeInstantiation(vecSchema, []);
    }

    if (components.every((e) => first === e)) {
      return ctx.gen.typeInstantiation(vecSchema, [numericLiteralToSnippet(first)]);
    }

    return ctx.gen.typeInstantiation(
      vecSchema,
      components.map((e) => numericLiteralToSnippet(e)),
    );
  }

  toString() {
    return `${this.kind}(${this.join(', ')})`;
  }
}

type Tuple2<S> = [S, S];
type Tuple3<S> = [S, S, S];
type Tuple4<S> = [S, S, S, S];

abstract class Vec2<S> extends VecBase<S> implements Tuple2<S> {
  declare readonly length: 2;

  e0: S;
  e1: S;

  /**
   * Takes components that are already cast to the element type. Each concrete vector class
   * casts in its own constructor, with its type's cast function, which is much faster than
   * looking the cast up dynamically for every vector created.
   */
  constructor(x: S, y: S) {
    super(2);
    this.e0 = x;
    this.e1 = y;
  }

  get 0() {
    return this.e0;
  }

  get 1() {
    return this.e1;
  }

  set 0(value: S) {
    this.e0 = this.castElement()(value);
  }

  set 1(value: S) {
    this.e1 = this.castElement()(value);
  }

  get x() {
    return this.e0;
  }

  get y() {
    return this.e1;
  }

  set x(value: S) {
    this[0] = value;
  }

  set y(value: S) {
    this[1] = value;
  }

  get r() {
    return this.e0;
  }

  get g() {
    return this.e1;
  }

  set r(value: S) {
    this[0] = value;
  }

  set g(value: S) {
    this[1] = value;
  }
}

abstract class Vec3<S> extends VecBase<S> implements Tuple3<S> {
  declare readonly length: 3;

  e0: S;
  e1: S;
  e2: S;

  /**
   * Takes components that are already cast to the element type. Each concrete vector class
   * casts in its own constructor, with its type's cast function, which is much faster than
   * looking the cast up dynamically for every vector created.
   */
  constructor(x: S, y: S, z: S) {
    super(3);
    this.e0 = x;
    this.e1 = y;
    this.e2 = z;
  }

  get 0() {
    return this.e0;
  }

  get 1() {
    return this.e1;
  }

  get 2() {
    return this.e2;
  }

  set 0(value: S) {
    this.e0 = this.castElement()(value);
  }

  set 1(value: S) {
    this.e1 = this.castElement()(value);
  }

  set 2(value: S) {
    this.e2 = this.castElement()(value);
  }

  get x() {
    return this.e0;
  }

  get y() {
    return this.e1;
  }

  get z() {
    return this.e2;
  }

  set x(value: S) {
    this[0] = value;
  }

  set y(value: S) {
    this[1] = value;
  }

  set z(value: S) {
    this[2] = value;
  }

  get r() {
    return this.e0;
  }

  get g() {
    return this.e1;
  }

  get b() {
    return this.e2;
  }

  set r(value: S) {
    this[0] = value;
  }

  set g(value: S) {
    this[1] = value;
  }

  set b(value: S) {
    this[2] = value;
  }
}

abstract class Vec4<S> extends VecBase<S> implements Tuple4<S> {
  declare readonly length: 4;

  e0: S;
  e1: S;
  e2: S;
  e3: S;

  /**
   * Takes components that are already cast to the element type. Each concrete vector class
   * casts in its own constructor, with its type's cast function, which is much faster than
   * looking the cast up dynamically for every vector created.
   */
  constructor(x: S, y: S, z: S, w: S) {
    super(4);
    this.e0 = x;
    this.e1 = y;
    this.e2 = z;
    this.e3 = w;
  }

  get 0() {
    return this.e0;
  }

  get 1() {
    return this.e1;
  }

  get 2() {
    return this.e2;
  }

  get 3() {
    return this.e3;
  }

  set 0(value: S) {
    this.e0 = this.castElement()(value);
  }

  set 1(value: S) {
    this.e1 = this.castElement()(value);
  }

  set 2(value: S) {
    this.e2 = this.castElement()(value);
  }

  set 3(value: S) {
    this.e3 = this.castElement()(value);
  }

  get x() {
    return this.e0;
  }

  get y() {
    return this.e1;
  }

  get z() {
    return this.e2;
  }

  get w() {
    return this.e3;
  }

  set x(value: S) {
    this[0] = value;
  }

  set y(value: S) {
    this[1] = value;
  }

  set z(value: S) {
    this[2] = value;
  }

  set w(value: S) {
    this[3] = value;
  }

  get r() {
    return this.e0;
  }

  get g() {
    return this.e1;
  }

  get b() {
    return this.e2;
  }

  get a() {
    return this.e3;
  }

  set r(value: S) {
    this[0] = value;
  }

  set g(value: S) {
    this[1] = value;
  }

  set b(value: S) {
    this[2] = value;
  }

  set a(value: S) {
    this[3] = value;
  }
}

export class Vec2fImpl extends Vec2<number> {
  constructor(x?: number, y?: number) {
    super(castToF32(x), castToF32(y ?? x));
  }

  get [$internal]() {
    return f32Internal;
  }

  get kind() {
    return 'vec2f' as const;
  }

  get _Vec2() {
    return Vec2fImpl;
  }
  get _Vec3() {
    return Vec3fImpl;
  }
  get _Vec4() {
    return Vec4fImpl;
  }
}

export class Vec2hImpl extends Vec2<number> {
  constructor(x?: number, y?: number) {
    super(castToF16(x), castToF16(y ?? x));
  }

  get [$internal]() {
    return f16Internal;
  }

  get kind() {
    return 'vec2h' as const;
  }

  get _Vec2() {
    return Vec2hImpl;
  }
  get _Vec3() {
    return Vec3hImpl;
  }
  get _Vec4() {
    return Vec4hImpl;
  }
}

export class Vec2iImpl extends Vec2<number> {
  constructor(x?: number, y?: number) {
    super(castToI32(x), castToI32(y ?? x));
  }

  get [$internal]() {
    return i32Internal;
  }

  get kind() {
    return 'vec2i' as const;
  }

  get _Vec2() {
    return Vec2iImpl;
  }
  get _Vec3() {
    return Vec3iImpl;
  }
  get _Vec4() {
    return Vec4iImpl;
  }
}

export class Vec2uImpl extends Vec2<number> {
  constructor(x?: number, y?: number) {
    super(castToU32(x), castToU32(y ?? x));
  }

  get [$internal]() {
    return u32Internal;
  }

  get kind() {
    return 'vec2u' as const;
  }

  get _Vec2() {
    return Vec2uImpl;
  }
  get _Vec3() {
    return Vec3uImpl;
  }
  get _Vec4() {
    return Vec4uImpl;
  }
}

export class Vec2bImpl extends Vec2<boolean> {
  constructor(x?: boolean, y?: boolean) {
    super(castToBool(x), castToBool(y ?? x));
  }

  get [$internal]() {
    return boolInternal;
  }

  get kind() {
    return 'vec2<bool>' as const;
  }

  get _Vec2() {
    return Vec2bImpl;
  }
  get _Vec3() {
    return Vec3bImpl;
  }
  get _Vec4() {
    return Vec4bImpl;
  }
}

export class Vec3fImpl extends Vec3<number> {
  constructor(x?: number, y?: number, z?: number) {
    super(castToF32(x), castToF32(y ?? x), castToF32(z ?? x));
  }

  get [$internal]() {
    return f32Internal;
  }

  get kind() {
    return 'vec3f' as const;
  }

  get _Vec2() {
    return Vec2fImpl;
  }
  get _Vec3() {
    return Vec3fImpl;
  }
  get _Vec4() {
    return Vec4fImpl;
  }
}

export class Vec3hImpl extends Vec3<number> {
  constructor(x?: number, y?: number, z?: number) {
    super(castToF16(x), castToF16(y ?? x), castToF16(z ?? x));
  }

  get [$internal]() {
    return f16Internal;
  }

  get kind() {
    return 'vec3h' as const;
  }

  get _Vec2() {
    return Vec2hImpl;
  }
  get _Vec3() {
    return Vec3hImpl;
  }
  get _Vec4() {
    return Vec4hImpl;
  }
}

export class Vec3iImpl extends Vec3<number> {
  constructor(x?: number, y?: number, z?: number) {
    super(castToI32(x), castToI32(y ?? x), castToI32(z ?? x));
  }

  get [$internal]() {
    return i32Internal;
  }

  get kind() {
    return 'vec3i' as const;
  }

  get _Vec2() {
    return Vec2iImpl;
  }
  get _Vec3() {
    return Vec3iImpl;
  }
  get _Vec4() {
    return Vec4iImpl;
  }
}

export class Vec3uImpl extends Vec3<number> {
  constructor(x?: number, y?: number, z?: number) {
    super(castToU32(x), castToU32(y ?? x), castToU32(z ?? x));
  }

  get [$internal]() {
    return u32Internal;
  }

  get kind() {
    return 'vec3u' as const;
  }

  get _Vec2() {
    return Vec2uImpl;
  }
  get _Vec3() {
    return Vec3uImpl;
  }
  get _Vec4() {
    return Vec4uImpl;
  }
}

export class Vec3bImpl extends Vec3<boolean> {
  constructor(x?: boolean, y?: boolean, z?: boolean) {
    super(castToBool(x), castToBool(y ?? x), castToBool(z ?? x));
  }

  get [$internal]() {
    return boolInternal;
  }

  get kind() {
    return 'vec3<bool>' as const;
  }

  get _Vec2() {
    return Vec2bImpl;
  }
  get _Vec3() {
    return Vec3bImpl;
  }
  get _Vec4() {
    return Vec4bImpl;
  }
}

export class Vec4fImpl extends Vec4<number> {
  constructor(x?: number, y?: number, z?: number, w?: number) {
    super(castToF32(x), castToF32(y ?? x), castToF32(z ?? x), castToF32(w ?? x));
  }

  get [$internal]() {
    return f32Internal;
  }

  get kind() {
    return 'vec4f' as const;
  }

  get _Vec2() {
    return Vec2fImpl;
  }
  get _Vec3() {
    return Vec3fImpl;
  }
  get _Vec4() {
    return Vec4fImpl;
  }
}

export class Vec4hImpl extends Vec4<number> {
  constructor(x?: number, y?: number, z?: number, w?: number) {
    super(castToF16(x), castToF16(y ?? x), castToF16(z ?? x), castToF16(w ?? x));
  }

  get [$internal]() {
    return f16Internal;
  }

  get kind() {
    return 'vec4h' as const;
  }

  get _Vec2() {
    return Vec2hImpl;
  }
  get _Vec3() {
    return Vec3hImpl;
  }
  get _Vec4() {
    return Vec4hImpl;
  }
}

export class Vec4iImpl extends Vec4<number> {
  constructor(x?: number, y?: number, z?: number, w?: number) {
    super(castToI32(x), castToI32(y ?? x), castToI32(z ?? x), castToI32(w ?? x));
  }

  get [$internal]() {
    return i32Internal;
  }

  get kind() {
    return 'vec4i' as const;
  }

  get _Vec2() {
    return Vec2iImpl;
  }
  get _Vec3() {
    return Vec3iImpl;
  }
  get _Vec4() {
    return Vec4iImpl;
  }
}

export class Vec4uImpl extends Vec4<number> {
  constructor(x?: number, y?: number, z?: number, w?: number) {
    super(castToU32(x), castToU32(y ?? x), castToU32(z ?? x), castToU32(w ?? x));
  }

  get [$internal]() {
    return u32Internal;
  }

  get kind() {
    return 'vec4u' as const;
  }

  get _Vec2() {
    return Vec2uImpl;
  }
  get _Vec3() {
    return Vec3uImpl;
  }
  get _Vec4() {
    return Vec4uImpl;
  }
}

export class Vec4bImpl extends Vec4<boolean> {
  constructor(x?: boolean, y?: boolean, z?: boolean, w?: boolean) {
    super(castToBool(x), castToBool(y ?? x), castToBool(z ?? x), castToBool(w ?? x));
  }

  get [$internal]() {
    return boolInternal;
  }

  get kind() {
    return 'vec4<bool>' as const;
  }

  get _Vec2() {
    return Vec2bImpl;
  }
  get _Vec3() {
    return Vec3bImpl;
  }
  get _Vec4() {
    return Vec4bImpl;
  }
}
