import { $gpuCallable, $internal, $repr, $resolve } from '../shared/symbols.ts';
import { setName } from '../shared/meta.ts';
import { isKnownAtComptime } from '../types.ts';
import type { GPUCallable, SelfResolvable } from '../types.ts';
import { WgslTypeError, abstractVectorError } from '../errors.ts';
import { abstractFloat } from './numeric.ts';
import { snip, type Snippet } from './snippet.ts';
import {
  isVecInstance,
  isVecBoolInstance,
  type AnyNumericVecInstance,
  type Vec2,
  type Vec3,
  type Vec4,
} from './wgslTypes.ts';

/** Shared behavior only: abstract vectors deliberately do not extend Array. */
export abstract class AbstractVecBase implements SelfResolvable {
  [n: number]: number;
  abstract readonly kind: 'vec2' | 'vec3' | 'vec4';
  abstract readonly length: 2 | 3 | 4;

  get [$internal]() {
    return true;
  }

  *[Symbol.iterator]() {
    for (let i = 0; i < this.length; i++) yield this[i] as number;
  }

  toString() {
    return `${this.kind}(${Array.from(this).join(', ')})`;
  }

  [$resolve](): never {
    throw abstractVectorError(this.kind);
  }
}

class AbstractVec2 extends AbstractVecBase {
  x: number;
  y: number;
  constructor(x = 0, y = x) {
    super();
    this.x = x;
    this.y = y;
  }
  get kind() {
    return 'vec2' as const;
  }
  get length() {
    return 2 as const;
  }
  get schema() {
    return vec2;
  }
  get 0() {
    return this.x;
  }
  set 0(value: number) {
    this.x = value;
  }
  get 1() {
    return this.y;
  }
  set 1(value: number) {
    this.y = value;
  }
  get r() {
    return this.x;
  }
  set r(value: number) {
    this.x = value;
  }
  get g() {
    return this.y;
  }
  set g(value: number) {
    this.y = value;
  }
}

class AbstractVec3 extends AbstractVecBase {
  x: number;
  y: number;
  z: number;
  constructor(x = 0, y = x, z = x) {
    super();
    this.x = x;
    this.y = y;
    this.z = z;
  }
  get kind() {
    return 'vec3' as const;
  }
  get length() {
    return 3 as const;
  }
  get schema() {
    return vec3;
  }
  get 0() {
    return this.x;
  }
  set 0(value: number) {
    this.x = value;
  }
  get 1() {
    return this.y;
  }
  set 1(value: number) {
    this.y = value;
  }
  get 2() {
    return this.z;
  }
  set 2(value: number) {
    this.z = value;
  }
  get r() {
    return this.x;
  }
  set r(value: number) {
    this.x = value;
  }
  get g() {
    return this.y;
  }
  set g(value: number) {
    this.y = value;
  }
  get b() {
    return this.z;
  }
  set b(value: number) {
    this.z = value;
  }
}

class AbstractVec4 extends AbstractVecBase {
  x: number;
  y: number;
  z: number;
  w: number;
  constructor(x = 0, y = x, z = x, w = x) {
    super();
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  get kind() {
    return 'vec4' as const;
  }
  get length() {
    return 4 as const;
  }
  get schema() {
    return vec4;
  }
  get 0() {
    return this.x;
  }
  set 0(value: number) {
    this.x = value;
  }
  get 1() {
    return this.y;
  }
  set 1(value: number) {
    this.y = value;
  }
  get 2() {
    return this.z;
  }
  set 2(value: number) {
    this.z = value;
  }
  get 3() {
    return this.w;
  }
  set 3(value: number) {
    this.w = value;
  }
  get r() {
    return this.x;
  }
  set r(value: number) {
    this.x = value;
  }
  get g() {
    return this.y;
  }
  set g(value: number) {
    this.y = value;
  }
  get b() {
    return this.z;
  }
  set b(value: number) {
    this.z = value;
  }
  get a() {
    return this.w;
  }
  set a(value: number) {
    this.w = value;
  }
}

// Like concrete-vector swizzles, these descriptors are shared by all instances.
for (const length of [2, 3, 4]) {
  for (let pattern = 0; pattern < 4 ** length; pattern++) {
    const indices = Array.from({ length }, (_, i) => (pattern >> (2 * i)) & 3);
    const fields = indices.map((i) => 'xyzw'[i] as string);
    const get = function (this: AbstractVecBase) {
      const value = this as unknown as Record<string, number>;
      const x = value[fields[0] as string];
      const y = value[fields[1] as string];
      if (length === 2) return new AbstractVec2(x, y);
      const z = value[fields[2] as string];
      if (length === 3) return new AbstractVec3(x, y, z);
      return new AbstractVec4(x, y, z, value[fields[3] as string]);
    };
    for (const alphabet of ['xyzw', 'rgba']) {
      Object.defineProperty(AbstractVecBase.prototype, indices.map((i) => alphabet[i]).join(''), {
        get,
      });
    }
  }
}

function makeAbstractVector(
  kind: 'vec2' | 'vec3' | 'vec4',
  componentCount: 2 | 3 | 4,
  Impl: new (...args: number[]) => AbstractVecBase,
) {
  const construct = (...args: (number | AnyNumericVecInstance)[]) => {
    if (
      (args.length <= 1 || args.length === componentCount) &&
      args.every((a) => typeof a === 'number')
    ) {
      return new Impl(...(args as number[]));
    }
    const values: number[] = [];
    for (const arg of args) {
      if (typeof arg === 'number') values.push(arg);
      else if (isVecInstance(arg) && !isVecBoolInstance(arg)) {
        for (let i = 0; i < arg.length; i++) values.push(arg[i] as number);
      } else throw new WgslTypeError(`${kind} expects numbers or numeric vectors.`);
    }
    if (values.length !== componentCount) {
      throw new WgslTypeError(`'${kind}' constructor called with invalid number of arguments.`);
    }
    return new Impl(...values);
  };

  const schema = Object.assign(construct, {
    [$internal]: {},
    [$repr]: undefined,
    type: kind,
    primitive: abstractFloat,
    componentCount,
    toString: () => kind,
    [$gpuCallable]: {
      strictSignature: undefined,
      call(_ctx, args): Snippet {
        if (!args.every(isKnownAtComptime)) throw abstractVectorError(kind);
        return snip(
          construct(...(args.map((arg) => arg.value) as (number | AnyNumericVecInstance)[])),
          schema,
          'constant',
          args.some((arg) => arg.possibleSideEffects),
        );
      },
    } satisfies GPUCallable[typeof $gpuCallable],
  });
  setName(schema, kind);
  return schema;
}

export const vec2 = makeAbstractVector('vec2', 2, AbstractVec2) as unknown as Vec2;
export const vec3 = makeAbstractVector('vec3', 3, AbstractVec3) as unknown as Vec3;
export const vec4 = makeAbstractVector('vec4', 4, AbstractVec4) as unknown as Vec4;
