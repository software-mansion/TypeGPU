import { describe, expectTypeOf, it } from 'vitest';
import type {
  DataToAttribs,
  TgpuVertexAttrib,
} from '../src/core/buffer/vertexUsage';
import type * as d from '../src/data';

describe('DataToAttribs', () => {
  it('bruh', () => {
    type Result = DataToAttribs<d.TgpuLooseArray<d.F32>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<d.float32>>();
  });
});
