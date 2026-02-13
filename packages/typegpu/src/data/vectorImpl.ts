import { Operator } from 'tsover-runtime';
import { $internal, $resolve } from '../shared/symbols.ts';
import type { SelfResolvable } from '../types.ts';
import { bool, f16, f32, i32, u32 } from './numeric.ts';
import { type ResolvedSnippet, snip } from './snippet.ts';
import type { BaseData, VecKind } from './wgslTypes.ts';

type VecSchema<S> = BaseData & ((v?: S) => S);

const XYZW = ['x', 'y', 'z', 'w'];
const RGBA = ['r', 'g', 'b', 'a'];

// deno-fmt-ignore
export abstract class VecBase<S> extends Array implements SelfResolvable {
  abstract readonly [$internal]: {
    elementSchema: VecSchema<S>;
  };
  abstract get kind(): VecKind;

  abstract get _Vec2(): new (
    x: S,
    y: S,
  ) => Vec2<S>;
  abstract get _Vec3(): new (
    x: S,
    y: S,
    z: S,
  ) => Vec3<S>;
  abstract get _Vec4(): new (
    x: S,
    y: S,
    z: S,
    w: S,
  ) => Vec4<S>;

  static {
    // Defining 4-length swizzles
    for (let e0 = 0; e0 < 4; e0++) {
      for (let e1 = 0; e1 < 4; e1++) {
        for (let e2 = 0; e2 < 4; e2++) {
          for (let e3 = 0; e3 < 4; e3++) {
            const xyzwProp = `${XYZW[e0]}${XYZW[e1]}${XYZW[e2]}${XYZW[e3]}`;
            const rgbaProp = `${RGBA[e0]}${RGBA[e1]}${RGBA[e2]}${RGBA[e3]}`;
            Object.defineProperty(VecBase.prototype, xyzwProp, {
              get(this: VecBase<unknown>) {
                return new this._Vec4(this[e0], this[e1], this[e2], this[e3]);
              },
            });
            Object.defineProperty(VecBase.prototype, rgbaProp, {
              get(this: VecBase<unknown>) {
                return new this._Vec4(this[e0], this[e1], this[e2], this[e3]);
              },
            });
          }
        }
      }
    }

    // Defining 3-length swizzles
    for (let e0 = 0; e0 < 4; e0++) {
      for (let e1 = 0; e1 < 4; e1++) {
        for (let e2 = 0; e2 < 4; e2++) {
          const xyzwProp = `${XYZW[e0]}${XYZW[e1]}${XYZW[e2]}`;
          const rgbaProp = `${RGBA[e0]}${RGBA[e1]}${RGBA[e2]}`;
          Object.defineProperty(VecBase.prototype, xyzwProp, {
            get(this: VecBase<unknown>) {
              return new this._Vec3(this[e0], this[e1], this[e2]);
            },
          });
          Object.defineProperty(VecBase.prototype, rgbaProp, {
            get(this: VecBase<unknown>) {
              return new this._Vec3(this[e0], this[e1], this[e2]);
            },
          });
        }
      }
    }

    // Defining 2-length swizzles
    for (let e0 = 0; e0 < 4; e0++) {
      for (let e1 = 0; e1 < 4; e1++) {
        const xyzwProp = `${XYZW[e0]}${XYZW[e1]}`;
        const rgbaProp = `${RGBA[e0]}${RGBA[e1]}`;
        Object.defineProperty(VecBase.prototype, xyzwProp, {
          get(this: VecBase<unknown>) {
            return new this._Vec2(this[e0], this[e1]);
          },
        });
        Object.defineProperty(VecBase.prototype, rgbaProp, {
          get(this: VecBase<unknown>) {
            return new this._Vec2(this[e0], this[e1]);
          },
        });
      }
    }
  }

  castElement(): (v?: S) => S {
    return this[$internal].elementSchema;
  }

  [$resolve](): ResolvedSnippet {
    const schema = this[$internal].elementSchema;
    if (this.every((e) => !e)) {
      return snip(`${this.kind}()`, schema, /* origin */ 'constant');
    }
    if (this.every((e) => this[0] === e)) {
      return snip(`${this.kind}(${this[0]})`, schema, /* origin */ 'runtime');
    }
    return snip(`${this.kind}(${this.join(', ')})`, schema, /* origin */ 'runtime');
  }

  toString() {
    return this[$resolve]().value;
  }
}

type Tuple2<S> = [S, S];
type Tuple3<S> = [S, S, S];
type Tuple4<S> = [S, S, S, S];

abstract class Vec2<S> extends VecBase<S> implements Tuple2<S> {
  declare readonly length: 2;

  e0: S;
  e1: S;

  constructor(x?: S, y?: S) {
    super(2);
    this.e0 = this.castElement()(x);
    this.e1 = this.castElement()(y ?? x);
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
    return this[0];
  }

  get y() {
    return this[1];
  }

  set x(value: S) {
    this[0] = this.castElement()(value);
  }

  set y(value: S) {
    this[1] = this.castElement()(value);
  }

  get r() {
    return this[0];
  }

  get g() {
    return this[1];
  }

  set r(value: S) {
    this[0] = this.castElement()(value);
  }

  set g(value: S) {
    this[1] = this.castElement()(value);
  }

  [Operator.plus](lhs: Vec2<S>, rhs: Vec2<S>) {
    return new this._Vec2(
      (lhs[0] as number) + (rhs[0] as number) as S,
      (lhs[1] as number) + (rhs[1] as number) as S,
    );
  }
}

abstract class Vec3<S> extends VecBase<S> implements Tuple3<S> {
  declare readonly length: 3;

  e0: S;
  e1: S;
  e2: S;

  constructor(x?: S, y?: S, z?: S) {
    super(3);
    this.e0 = this.castElement()(x);
    this.e1 = this.castElement()(y ?? x);
    this.e2 = this.castElement()(z ?? x);
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
    return this[0];
  }

  get y() {
    return this[1];
  }

  get z() {
    return this[2];
  }

  set x(value: S) {
    this[0] = this.castElement()(value);
  }

  set y(value: S) {
    this[1] = this.castElement()(value);
  }

  set z(value: S) {
    this[2] = this.castElement()(value);
  }

  get r() {
    return this[0];
  }

  get g() {
    return this[1];
  }

  get b() {
    return this[2];
  }

  set r(value: S) {
    this[0] = this.castElement()(value);
  }

  set g(value: S) {
    this[1] = this.castElement()(value);
  }

  set b(value: S) {
    this[2] = this.castElement()(value);
  }
}

abstract class Vec4<S> extends VecBase<S> implements Tuple4<S> {
  declare readonly length: 4;

  e0: S;
  e1: S;
  e2: S;
  e3: S;

  constructor(x?: S, y?: S, z?: S, w?: S) {
    super(4);
    this.e0 = this.castElement()(x);
    this.e1 = this.castElement()(y ?? x);
    this.e2 = this.castElement()(z ?? x);
    this.e3 = this.castElement()(w ?? x);
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
    return this[0];
  }

  get y() {
    return this[1];
  }

  get r() {
    return this[0];
  }

  get g() {
    return this[1];
  }

  get b() {
    return this[2];
  }

  get a() {
    return this[3];
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

  get z() {
    return this[2];
  }

  get w() {
    return this[3];
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
}

export class Vec2fImpl extends Vec2<number> {
  get [$internal]() {
    return {
      elementSchema: f32,
    };
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
  get [$internal]() {
    return {
      elementSchema: f16,
    };
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
  get [$internal]() {
    return {
      elementSchema: i32,
    };
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
  get [$internal]() {
    return {
      elementSchema: u32,
    };
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
  get [$internal]() {
    return {
      elementSchema: bool,
    };
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
  get [$internal]() {
    return {
      elementSchema: f32,
    };
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
  get [$internal]() {
    return {
      elementSchema: f16,
    };
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
  get [$internal]() {
    return {
      elementSchema: i32,
    };
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
  get [$internal]() {
    return {
      elementSchema: u32,
    };
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
  get [$internal]() {
    return {
      elementSchema: bool,
    };
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
  get [$internal]() {
    return {
      elementSchema: f32,
    };
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
  get [$internal]() {
    return {
      elementSchema: f16,
    };
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
  get [$internal]() {
    return {
      elementSchema: i32,
    };
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
  get [$internal]() {
    return {
      elementSchema: u32,
    };
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
  get [$internal]() {
    return {
      elementSchema: bool,
    };
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
