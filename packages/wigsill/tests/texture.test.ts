import { describe, expect, it } from 'vitest';
import { wgsl } from 'wigsill';

describe('texture', () => {
  it('creates a texture with no usage', () => {
    const texture = wgsl.texture({
      size: [1, 1],
      format: 'rgba8unorm',
    });
    // should be null
    expect(texture.$asTypedTexture()).toBe(null);
  });
});
