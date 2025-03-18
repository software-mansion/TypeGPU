import { bool } from 'src/data';
import { VectorOps } from 'src/data/vectorOps';
import type {
  AnyVec2Instance,
  AnyVec3Instance,
  AnyVec4Instance,
  AnyVecInstance,
  v2b,
  v3b,
  v4b,
} from 'src/data/wgslTypes';
import { createDualImpl } from 'src/shared/generators';

type EqOverload = {
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
