import { describe, expectTypeOf, it } from 'vitest';
import { type Vec3f, vec3f } from '../src/data';
import tgpu, { type TgpuBufferUsage } from '../src/experimental';

describe('TgpuBindGroupLayout', () => {
  it('hello', async () => {
    const layout0 = tgpu.bindGroupLayout({
      position: { type: 'uniform', data: vec3f },
    });

    const { position } = layout0.bound;

    expectTypeOf(position).toEqualTypeOf<TgpuBufferUsage<Vec3f, 'uniform'>>();
  });
});
