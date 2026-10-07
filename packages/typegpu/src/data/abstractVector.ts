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
  type AnyAbstractVecInstance,
  type Vec2,
  type Vec3,
  type Vec4,
} from './wgslTypes.ts';

/** Shared behavior only: abstract vectors deliberately do not extend Array. */
export abstract class AbstractVecBase implements SelfResolvable {
  [n: number]: number;
  abstract readonly kind: 'vec2' | 'vec3' | 'vec4';
  abstract readonly length: 2 | 3 | 4;
  abstract addComponents(rhs: unknown): AbstractVecBase | undefined;
  abstract multiplyComponents(rhs: unknown): AbstractVecBase | undefined;

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
  addComponents(b: unknown): AbstractVec2 | undefined {
    if (typeof b === 'number') return new AbstractVec2(this.x + b, this.y + b);
    if (b instanceof AbstractVec2) return new AbstractVec2(this.x + b.x, this.y + b.y);
    return undefined;
  }
  multiplyComponents(b: unknown): AbstractVec2 | undefined {
    if (typeof b === 'number') return new AbstractVec2(this.x * b, this.y * b);
    if (b instanceof AbstractVec2) return new AbstractVec2(this.x * b.x, this.y * b.y);
    return undefined;
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
  addComponents(b: unknown): AbstractVec3 | undefined {
    if (typeof b === 'number') return new AbstractVec3(this.x + b, this.y + b, this.z + b);
    if (b instanceof AbstractVec3)
      return new AbstractVec3(this.x + b.x, this.y + b.y, this.z + b.z);
    return undefined;
  }
  multiplyComponents(b: unknown): AbstractVec3 | undefined {
    if (typeof b === 'number') return new AbstractVec3(this.x * b, this.y * b, this.z * b);
    if (b instanceof AbstractVec3)
      return new AbstractVec3(this.x * b.x, this.y * b.y, this.z * b.z);
    return undefined;
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
  addComponents(b: unknown): AbstractVec4 | undefined {
    if (typeof b === 'number')
      return new AbstractVec4(this.x + b, this.y + b, this.z + b, this.w + b);
    if (b instanceof AbstractVec4)
      return new AbstractVec4(this.x + b.x, this.y + b.y, this.z + b.z, this.w + b.w);
    return undefined;
  }
  multiplyComponents(b: unknown): AbstractVec4 | undefined {
    if (typeof b === 'number')
      return new AbstractVec4(this.x * b, this.y * b, this.z * b, this.w * b);
    if (b instanceof AbstractVec4)
      return new AbstractVec4(this.x * b.x, this.y * b.y, this.z * b.z, this.w * b.w);
    return undefined;
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

/** Internal CPU fast paths. Callers fall back to ordinary validation for other types. */
export function isAbstractVector(value: unknown): value is AnyAbstractVecInstance {
  return value instanceof AbstractVecBase;
}

export function mapAbstractVector<T extends AnyAbstractVecInstance>(
  v: T,
  fn: (x: number) => number,
): T {
  switch (v.kind) {
    case 'vec2':
      return new AbstractVec2(fn(v.x), fn(v.y)) as unknown as T;
    case 'vec3':
      return new AbstractVec3(fn(v.x), fn(v.y), fn(v.z)) as unknown as T;
    case 'vec4':
      return new AbstractVec4(fn(v.x), fn(v.y), fn(v.z), fn(v.w)) as unknown as T;
  }
}

// One closure per operation keeps the scalar function stable for the JIT. There
// are no broadcast vectors, argument arrays, or per-call closures on this path.
export function createAbstractBinary(fn: (a: number, b: number) => number) {
  return (lhs: unknown, rhs: unknown): AnyAbstractVecInstance | undefined => {
    const a = typeof lhs === 'number' ? lhs : isAbstractVector(lhs) ? lhs : undefined;
    const b = typeof rhs === 'number' ? rhs : isAbstractVector(rhs) ? rhs : undefined;
    if (a === undefined || b === undefined) return undefined;
    const v = typeof a === 'number' ? b : a;
    if (typeof v === 'number') return undefined;
    if (typeof a !== 'number' && typeof b !== 'number' && a.kind !== b.kind) return undefined;
    const x = fn(typeof a === 'number' ? a : a.x, typeof b === 'number' ? b : b.x);
    const y = fn(typeof a === 'number' ? a : a.y, typeof b === 'number' ? b : b.y);
    if (v.kind === 'vec2') return new AbstractVec2(x, y) as unknown as AnyAbstractVecInstance;
    const z = fn(
      typeof a === 'number' ? a : (a as Exclude<AnyAbstractVecInstance, { kind: 'vec2' }>).z,
      typeof b === 'number' ? b : (b as Exclude<AnyAbstractVecInstance, { kind: 'vec2' }>).z,
    );
    if (v.kind === 'vec3') return new AbstractVec3(x, y, z) as unknown as AnyAbstractVecInstance;
    const w = fn(
      typeof a === 'number' ? a : (a as Extract<AnyAbstractVecInstance, { kind: 'vec4' }>).w,
      typeof b === 'number' ? b : (b as Extract<AnyAbstractVecInstance, { kind: 'vec4' }>).w,
    );
    return new AbstractVec4(x, y, z, w) as unknown as AnyAbstractVecInstance;
  };
}

export function abstractAdd(a: unknown, b: unknown): AnyAbstractVecInstance | undefined {
  if (a instanceof AbstractVecBase) return a.addComponents(b) as AnyAbstractVecInstance | undefined;
  if (typeof a === 'number' && b instanceof AbstractVecBase)
    return b.addComponents(a) as AnyAbstractVecInstance | undefined;
  return undefined;
}

export function abstractMul(a: unknown, b: unknown): AnyAbstractVecInstance | undefined {
  if (a instanceof AbstractVecBase)
    return a.multiplyComponents(b) as AnyAbstractVecInstance | undefined;
  if (typeof a === 'number' && b instanceof AbstractVecBase)
    return b.multiplyComponents(a) as AnyAbstractVecInstance | undefined;
  return undefined;
}

export function abstractLength(v: AnyAbstractVecInstance): number {
  switch (v.kind) {
    case 'vec2':
      return Math.sqrt(v.x ** 2 + v.y ** 2);
    case 'vec3':
      return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
    case 'vec4':
      return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2);
  }
}

export function abstractDot(a: AnyAbstractVecInstance, b: AnyAbstractVecInstance): number {
  switch (a.kind) {
    case 'vec2':
      return a.x * b.x + a.y * b.y;
    case 'vec3':
      return a.x * b.x + a.y * b.y + a.z * (b as typeof a).z;
    case 'vec4':
      return a.x * b.x + a.y * b.y + a.z * (b as typeof a).z + a.w * (b as typeof a).w;
  }
}

// Like concrete-vector swizzles, these descriptors are shared by all instances.
for (const length of [2, 3, 4]) {
  for (let pattern = 0; pattern < 4 ** length; pattern++) {
    const indices = Array.from({ length }, (_, i) => (pattern >> (2 * i)) & 3);
    const fields = indices.map((i) => 'xyzw'[i] as string);
    const [x, y, z, w] = fields as [string, string, string, string];
    type Components = Record<string, number>;
    const get =
      length === 2
        ? function (this: Components) {
            return new AbstractVec2(this[x], this[y]);
          }
        : length === 3
          ? function (this: Components) {
              return new AbstractVec3(this[x], this[y], this[z]);
            }
          : function (this: Components) {
              return new AbstractVec4(this[x], this[y], this[z], this[w]);
            };
    for (const alphabet of ['xyzw', 'rgba']) {
      Object.defineProperty(AbstractVecBase.prototype, indices.map((i) => alphabet[i]).join(''), {
        get,
      });
    }
  }
}

type VectorArg = number | AnyNumericVecInstance;
function fastConstructor(n: 2 | 3 | 4, fallback: (...args: VectorArg[]) => AbstractVecBase) {
  if (n === 2)
    return function (x?: VectorArg, y?: VectorArg) {
      if (arguments.length === 0) return new AbstractVec2();
      if (typeof x === 'number') {
        if (arguments.length === 1) return new AbstractVec2(x);
        if (arguments.length === 2 && typeof y === 'number') return new AbstractVec2(x, y);
      }
      if (arguments.length === 1 && x instanceof AbstractVec2) return new AbstractVec2(x.x, x.y);
      return fallback(...(Array.from(arguments) as VectorArg[]));
    };
  if (n === 3)
    return function (x?: VectorArg, y?: VectorArg, z?: VectorArg) {
      if (arguments.length === 0) return new AbstractVec3();
      if (typeof x === 'number') {
        if (arguments.length === 1) return new AbstractVec3(x);
        if (arguments.length === 3 && typeof y === 'number' && typeof z === 'number')
          return new AbstractVec3(x, y, z);
      }
      if (arguments.length === 1 && x instanceof AbstractVec3)
        return new AbstractVec3(x.x, x.y, x.z);
      return fallback(...(Array.from(arguments) as VectorArg[]));
    };
  if (n === 4)
    return function (x?: VectorArg, y?: VectorArg, z?: VectorArg, w?: VectorArg) {
      if (arguments.length === 0) return new AbstractVec4();
      if (typeof x === 'number') {
        if (arguments.length === 1) return new AbstractVec4(x);
        if (
          arguments.length === 4 &&
          typeof y === 'number' &&
          typeof z === 'number' &&
          typeof w === 'number'
        )
          return new AbstractVec4(x, y, z, w);
      }
      if (arguments.length === 1 && x instanceof AbstractVec4)
        return new AbstractVec4(x.x, x.y, x.z, x.w);
      return fallback(...(Array.from(arguments) as VectorArg[]));
    };
  throw new Error('Invalid abstract vector dimension');
}

function makeAbstractVector(
  kind: 'vec2' | 'vec3' | 'vec4',
  componentCount: 2 | 3 | 4,
  Impl: new (...args: number[]) => AbstractVecBase,
) {
  const fallback = (...args: (number | AnyNumericVecInstance)[]) => {
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

  const construct = fastConstructor(componentCount, fallback);

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
