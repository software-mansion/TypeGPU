import type { Infer } from 'typegpu/data';
import { f32, i32, struct, u32, vec2f } from 'typegpu/data';

export type JoinPath = Infer<typeof JoinPath>;
export const JoinPath = struct({
  joinIndex: u32,
  path: u32,
  /** -1 for vertices on the original segment, >=0 for vertices inside the join */
  depth: i32,
});

export type LineControlPoint = Infer<typeof LineControlPoint>;
export const LineControlPoint = struct({
  position: vec2f,
  radius: f32,
});
