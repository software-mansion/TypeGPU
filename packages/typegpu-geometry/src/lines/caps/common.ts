import tgpu from 'typegpu';
import { u32, vec2f } from 'typegpu/data';
import { JoinPath, LineSegmentVertex } from '../types.ts';

export const capShell = tgpu.fn(
  [u32, JoinPath, LineSegmentVertex, vec2f, vec2f, vec2f, vec2f, vec2f],
  vec2f,
);
