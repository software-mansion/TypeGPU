import type { TgpuRoot, TgpuTextureView } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const width = 64;
const height = 64;
const depth = 3;

const sdDisc = (uv: d.v2f) => {
  return std.length(uv.sub(d.vec2f(0.5))) - 0.3;
};

export class Pattern {
  patternView: TgpuTextureView<d.WgslTexture3d<d.F32>>;

  constructor(root: TgpuRoot) {
    const patternTexture = root['~unstable'].createTexture({
      format: 'r16float',
      size: [width, height, depth],
      dimension: '3d',
    }).$usage('sampled');

    const data = new Float16Array(width * height * depth);
    for (let l = 0; l < depth; l++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let uv = d.vec2f(x / width, y / height);
          uv.y += uv.x * 0.5;
          uv = uv.add((l % 2) * 0.25);
          let ruv = std.fract(uv.mul(2 ** l));
          const index = l * width * height + y * width + x;

          data[index] = sdDisc(ruv) + (data[index - width * height] ?? 0);
        }
      }
    }
    patternTexture.write(data.buffer);

    this.patternView = patternTexture.createView();
  }
}
