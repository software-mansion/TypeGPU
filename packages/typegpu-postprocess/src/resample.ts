import { d, std } from 'typegpu';
import { loadPixel, standalonePass, type Size } from './passes.ts';

export interface ResampleOptions {
  /** 'adapt' is only valid for the last pass and uses the render destination's size. */
  size: Size | 'adapt';
}

function sizeOf(options: ResampleOptions | Size | 'adapt'): Size | 'adapt' {
  return typeof options === 'object' && 'size' in options ? options.size : options;
}

function loadClamped(input: d.texture2d<d.F32>, pixel: d.v2i): d.v4f {
  'use gpu';
  const size = d.vec2i(std.textureDimensions(input));
  return std.textureLoad(input, std.clamp(pixel, d.vec2i(0), size - 1), 0);
}

export function resampleNearest(options: ResampleOptions | Size | 'adapt') {
  const size = sizeOf(options);
  return standalonePass({ size, callback: loadPixel });
}

export function resampleBilinear(options: ResampleOptions | Size | 'adapt') {
  const size = sizeOf(options);
  return standalonePass({
    size,
    callback: (input, uv) => {
      'use gpu';
      const position = uv * d.vec2f(std.textureDimensions(input)) - 0.5;
      const base = d.vec2i(std.floor(position));
      const fraction = std.fract(position);
      return std.mix(
        std.mix(loadClamped(input, base), loadClamped(input, base + d.vec2i(1, 0)), fraction.x),
        std.mix(
          loadClamped(input, base + d.vec2i(0, 1)),
          loadClamped(input, base + d.vec2i(1)),
          fraction.x,
        ),
        fraction.y,
      );
    },
  });
}

// Catmull–Rom cubic reconstruction (a = -0.5), with a support radius of two texels.
function cubicWeight(value: number): number {
  'use gpu';
  const x = std.abs(value);
  if (x <= 1) {
    return (1.5 * x - 2.5) * x * x + 1;
  }
  if (x < 2) {
    return ((-0.5 * x + 2.5) * x - 4) * x + 2;
  }
  return 0;
}

export function resampleBicubic(options: ResampleOptions | Size | 'adapt') {
  const size = sizeOf(options);
  return standalonePass({
    size,
    callback: (input, uv) => {
      'use gpu';
      const position = uv * d.vec2f(std.textureDimensions(input)) - 0.5;
      const base = d.vec2i(std.floor(position));
      const fraction = std.fract(position);
      let color = d.vec4f(0);
      for (let y = -1; y <= 2; y++) {
        for (let x = -1; x <= 2; x++) {
          const weight = cubicWeight(d.f32(x) - fraction.x) * cubicWeight(d.f32(y) - fraction.y);
          color += loadClamped(input, base + d.vec2i(x, y)) * weight;
        }
      }
      return color;
    },
  });
}

/** Alias retaining the originally proposed spelling. */
export const resampleBiliear = resampleBilinear;
