import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { palette } from '../utils.ts';
import { dimensionsSlot } from '../consts.ts';
import { timeAccess } from '../consts.ts';

export const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  {
    let newuv = std.mul(std.sub(uv.xy, 0.5), 2.0);
    newuv.y *= dimensionsSlot.$.h / dimensionsSlot.$.w;
    const uvv = newuv;
    const finalColor = d.vec3f(0.0, 0.0, 0.0);
    for (let i = 0.0; i < 5.0; i++) {
      newuv = std.sub(
        std.fract(std.mul(newuv, 1.3 * std.sin(timeAccess.$))),
        0.5,
      );
      let len = std.length(newuv) * std.exp(-std.length(uvv) * 2);
      const col = palette(std.length(uvv) + timeAccess.$ * 0.9);
      len = std.sin(len * 8 + timeAccess.$) / 8;
      len = std.abs(len);
      len = std.smoothstep(0.0, 0.1, len);
      len = 0.06 / len;
      finalColor.x += col.x * len;
      finalColor.y += col.y * len;
      finalColor.z += col.z * len;
    }
    return d.vec4f(finalColor, 1.0);
  }
});

// Variation
export const mainFragment2 = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  {
    let newuv = (uv.xy.sub(0.5)).mul(2);
    newuv.y = std.mul(newuv.y, dimensionsSlot.$.h / dimensionsSlot.$.w);
    const uvv = newuv;
    const finalColor = d.vec3f(0.0, 0.0, 0.0);
    for (let i = 0.0; i < 3.0; i++) {
      newuv = std.fract(newuv.mul(-0.9)).sub(0.5);
      let len = std.length(newuv) * std.exp(-std.length(uvv) * 0.5);
      const col = palette(std.length(uvv) + timeAccess.$ * 0.9);
      len = std.sin(len * 8 + timeAccess.$) / 8;
      len = std.abs(len);
      len = std.smoothstep(0.0, 0.1, len);
      len = 0.1 / len;
      finalColor.x += col.x * len;
      finalColor.y += col.y * len;
      finalColor.z += col.z * len;
    }
    return d.vec4f(finalColor, 1.0);
  }
});
