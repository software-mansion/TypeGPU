import { d, std } from 'typegpu';
import {
  Frame,
  captureDistance,
  frameResolution,
  impostorLayout,
  sampleColor,
} from '../impostor.ts';

export const sampleParallaxFrame = (frame: d.InferGPU<typeof Frame>) => {
  'use gpu';
  if (frame.uv.x < 0 || frame.uv.y < 0 || frame.uv.x >= 1 || frame.uv.y >= 1) {
    return d.vec4f(0);
  }
  const texel = d.vec2i(frame.uv * frameResolution);
  const depth = std.textureLoad(impostorLayout.$.depthAtlas, texel, frame.layer, 0).r;
  const height = std.select(0, captureDistance - depth, depth > 0);
  return sampleColor(frame, frame.uv + frame.uvSlope * height);
};
