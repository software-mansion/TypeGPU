import { bool, vec2b, vec3b, vec4b } from '../data';
import { VectorOps } from '../data/vectorOps';
import type {
  AnyBooleanVecInstance,
  AnyVec2Instance,
  AnyVec3Instance,
  AnyVec4Instance,
  AnyVecInstance,
  v2b,
  v3b,
  v4b,
} from '../data/wgslTypes';
import { createDualImpl } from '../shared/generators';
import type { Resource } from '../types';

export type EqOverload = {
  <T extends AnyVec2Instance>(s: T, v: T): v2b;
  <T extends AnyVec3Instance>(s: T, v: T): v3b;
  <T extends AnyVec4Instance>(s: T, v: T): v4b;
};

function correspondingBooleanVectorSchema(value: Resource) {
  if (value.dataType.type.includes('2')) {
    return vec2b;
  }
  if (value.dataType.type.includes('3')) {
    return vec3b;
  }
  return vec4b;
}

export const eq: EqOverload = createDualImpl(
  // CPU implementation
  (<T extends AnyVecInstance>(lhs: T, rhs: T) => {
    return VectorOps.eq[lhs.kind](lhs, rhs);
  }) as EqOverload,
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} == ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

export const neg = createDualImpl(
  // CPU implementation
  (value: AnyBooleanVecInstance) => {
    return VectorOps.neg[value.kind](value);
  },
  // GPU implementation
  (value) => ({
    value: `!(${value.value})`,
    dataType: value.dataType,
  }),
);

export const or = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) => {
    return VectorOps.or[lhs.kind](lhs, rhs);
  },
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} || ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

export const all = createDualImpl(
  // CPU implementation
  (value: AnyBooleanVecInstance) => {
    return VectorOps.all[value.kind](value);
  },
  // GPU implementation
  (value) => ({
    value: `all(${value.value})`,
    dataType: bool,
  }),
);

export const any = createDualImpl(
  // CPU implementation
  (value: AnyBooleanVecInstance) => {
    return VectorOps.any[value.kind](value);
  },
  // GPU implementation
  (value) => ({
    value: `any(${value.value})`,
    dataType: bool,
  }),
);
