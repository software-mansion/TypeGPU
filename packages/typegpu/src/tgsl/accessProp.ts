import { stitch } from '../core/resolve/stitch.ts';
import { AutoStruct } from '../data/autoStruct.ts';
import {
  InfixDispatch,
  isUnstruct,
  MatrixColumnsAccess,
  undecorate,
  UnknownData,
} from '../data/dataTypes.ts';
import { abstractInt, bool, f16, f32, i32, u32 } from '../data/numeric.ts';
import { derefSnippet } from '../data/ref.ts';
import { isEphemeralSnippet, snip, type Snippet } from '../data/snippet.ts';
import {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../data/vector.ts';
import {
  type BaseData,
  isMat,
  isNaturallyEphemeral,
  isPtr,
  isVec,
  isWgslArray,
  isWgslStruct,
} from '../data/wgslTypes.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { add, div, mod, mul, sub } from '../std/operators.ts';
import { isKnownAtComptime } from '../types.ts';
import { coerceToSnippet } from './generationHelpers.ts';

const infixKinds = [
  'vec2f',
  'vec3f',
  'vec4f',
  'vec2h',
  'vec3h',
  'vec4h',
  'vec2i',
  'vec3i',
  'vec4i',
  'vec2u',
  'vec3u',
  'vec4u',
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
];

export const infixOperators = {
  add,
  sub,
  mul,
  div,
  mod,
} as const;

export type InfixOperator = keyof typeof infixOperators;

type SwizzleableType = 'f' | 'h' | 'i' | 'u' | 'b';
type SwizzleLength = 1 | 2 | 3 | 4;

const swizzleLenToType: Record<SwizzleableType, Record<SwizzleLength, BaseData>> = {
  f: {
    1: f32,
    2: vec2f,
    3: vec3f,
    4: vec4f,
  },
  h: {
    1: f16,
    2: vec2h,
    3: vec3h,
    4: vec4h,
  },
  i: {
    1: i32,
    2: vec2i,
    3: vec3i,
    4: vec4i,
  },
  u: {
    1: u32,
    2: vec2u,
    3: vec3u,
    4: vec4u,
  },
  b: {
    1: bool,
    2: vec2b,
    3: vec3b,
    4: vec4b,
  },
} as const;

export function accessProp(target: Snippet, propName: string): Snippet | undefined {
  if (infixKinds.includes((target.dataType as BaseData).type) && propName in infixOperators) {
    const operator = infixOperators[propName as InfixOperator];
    return snip(
      new InfixDispatch(propName, target, operator[$gpuCallable].call.bind(operator)),
      UnknownData,
      /* origin */ target.origin,
    );
  }

  if (isWgslArray(target.dataType) && propName === 'length') {
    if (target.dataType.elementCount === 0) {
      // Dynamically-sized array
      return snip(stitch`arrayLength(&${target})`, u32, /* origin */ 'runtime');
    }

    return snip(target.dataType.elementCount, abstractInt, /* origin */ 'constant');
  }

  if (isMat(target.dataType) && propName === 'columns') {
    return snip(new MatrixColumnsAccess(target), UnknownData, /* origin */ target.origin);
  }

  if (isWgslStruct(target.dataType) || isUnstruct(target.dataType)) {
    let propType = target.dataType.propTypes[propName];
    if (!propType) {
      return undefined;
    }
    propType = undecorate(propType);

    return snip(
      stitch`${target}.${propName}`,
      propType,
      /* origin */ target.origin === 'argument'
        ? 'argument'
        : !isEphemeralSnippet(target) && !isNaturallyEphemeral(propType)
          ? target.origin
          : target.origin === 'constant' || target.origin === 'constant-tgpu-const-ref'
            ? 'constant'
            : 'runtime',
    );
  }

  if (target.dataType instanceof AutoStruct) {
    const result = target.dataType.accessProp(propName);
    if (!result) {
      return undefined;
    }
    return snip(stitch`${target}.${result.prop}`, result.type, 'argument');
  }

  if (isPtr(target.dataType)) {
    const derefed = derefSnippet(target);

    if (propName === '$') {
      // Dereference pointer
      return derefed;
    }

    // Sometimes values that are typed as pointers aren't instances of `d.ref`, so we
    // allow access to member props as if it wasn't a pointer.
    return accessProp(derefed, propName);
  }

  if (isVec(target.dataType)) {
    // Example: d.vec3f().kind === 'vec3f'
    if (propName === 'kind') {
      return snip(target.dataType.type, UnknownData, 'constant');
    }
  }

  const propLength = propName.length;
  if (isVec(target.dataType) && propLength >= 1 && propLength <= 4) {
    const isXYZW = /^[xyzw]+$/.test(propName);
    const isRGBA = /^[rgba]+$/.test(propName);

    if (!isXYZW && !isRGBA) {
      // Not a valid swizzle
      return undefined;
    }

    const swizzleTypeChar = target.dataType.type.includes('bool')
      ? 'b'
      : (target.dataType.type[4] as SwizzleableType);
    const swizzleType = swizzleLenToType[swizzleTypeChar][propLength as SwizzleLength];
    if (!swizzleType) {
      return undefined;
    }

    return snip(
      isKnownAtComptime(target)
        ? // oxlint-disable-next-line typescript/no-explicit-any -- it's fine, the prop is there
          (target.value as any)[propName]
        : stitch`${target}.${propName}`,
      swizzleType,
      // Swizzling creates new vectors (unless they're on the lhs of an assignment, but that's not yet supported in WGSL)
      /* origin */ target.origin === 'argument' && propLength === 1
        ? 'argument'
        : target.origin === 'constant' || target.origin === 'constant-tgpu-const-ref'
          ? 'constant'
          : 'runtime',
    );
  }

  if (isKnownAtComptime(target) || target.dataType === UnknownData) {
    // oxlint-disable-next-line typescript/no-explicit-any -- we either know exactly what it is, or have no idea at all
    return coerceToSnippet((target.value as any)[propName]);
  }

  return undefined;
}
