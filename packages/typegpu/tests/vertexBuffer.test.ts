import { describe, it } from 'vitest';
import * as d from '../src/data';
import tgpu, { asVertex } from '../src/experimental';

describe('vertexBuffer', () => {
  it('foo', async () => {
    const root = await tgpu.init();

    const buffer = root.createBuffer(d.f32).$usage(tgpu.Vertex);
    const usage = asVertex(buffer, 'vertex');
  });
});
