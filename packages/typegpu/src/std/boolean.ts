import { bool } from '../data';
import { VectorOps } from '../data/vectorOps';
import type {
  AnyVec2Instance,
  AnyVec3Instance,
  AnyVec4Instance,
  AnyVecInstance,
  v2b,
  v3b,
  v4b,
} from '../data/wgslTypes';
import { createDualImpl } from '../shared/generators';

export type EqOverload = {
  <T extends AnyVec2Instance>(s: T, v: T): v2b;
  <T extends AnyVec3Instance>(s: T, v: T): v3b;
  <T extends AnyVec4Instance>(s: T, v: T): v4b;
};

export const eq: EqOverload = createDualImpl(
  // CPU implementation
  (<T extends AnyVecInstance>(lhs: T, rhs: T) => {
    return VectorOps.eq[lhs.kind](lhs, rhs);
  }) as EqOverload,
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} == ${rhs.value})`,
    dataType: bool,
  }),
);
