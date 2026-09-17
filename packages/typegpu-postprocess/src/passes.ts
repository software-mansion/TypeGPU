import { d, std } from 'typegpu';

export type ColorTransform = (input: d.v4f) => d.v4f;
export type TextureTransform = (input: d.texture2d<d.F32>, uv: d.v2f) => d.v4f;
export type Size = readonly [number, number];

export interface OneToOnePass {
  readonly kind: 'one-to-one';
  readonly callback: ColorTransform;
}

export interface StandalonePass {
  readonly kind: 'standalone';
  readonly callback: TextureTransform;
  /** Output dimensions. Omit to preserve the input dimensions. */
  readonly size?: Size | 'adapt' | ((input: Size) => Size);
}

/** Multiple render stages used as one stack item, in execution order. */
export interface PassGroup {
  readonly kind: 'group';
  readonly passes: readonly (OneToOnePass | StandalonePass)[];
}

export type PostprocessPass = OneToOnePass | StandalonePass | PassGroup;

/** The callback must only read its input color and have no GPU side effects. */
export function oneToOnePass(callback: ColorTransform): OneToOnePass {
  return Object.freeze({ kind: 'one-to-one', callback });
}

/** Starts a new render pass; subsequent one-to-one passes can fuse into it. */
export function standalonePass(options: Omit<StandalonePass, 'kind'>): StandalonePass {
  return Object.freeze({ ...options, kind: 'standalone' });
}

/** Nearest-neighbor read, clamped to the input's edges, at mip level zero. */
export function loadPixel(input: d.texture2d<d.F32>, uv: d.v2f): d.v4f {
  'use gpu';
  const size = d.vec2i(std.textureDimensions(input));
  const pixel = std.clamp(d.vec2i(uv * d.vec2f(size)), d.vec2i(0), size - d.vec2i(1));
  return std.textureLoad(input, pixel, 0);
}
