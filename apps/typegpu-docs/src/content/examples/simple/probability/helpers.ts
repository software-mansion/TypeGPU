import { Distribution } from './types.ts';
import { randf } from '@typegpu/noise';

export function getPRNG(distribution: Distribution) {
  switch (distribution) {
    case Distribution.ON_UNIT_SPHERE: {
      return randf.onUnitSphere;
    }
    case Distribution.IN_UNIT_SPHERE: {
      return randf.inUnitSphere;
    }
  }
}
