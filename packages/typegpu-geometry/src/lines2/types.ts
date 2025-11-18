import type { Infer } from 'typegpu/data';
import { f32, struct, u32, vec2f } from 'typegpu/data';

export type LineControlPoint = Infer<typeof LineControlPoint>;
export const LineControlPoint = struct({
  position: vec2f,
  radius: f32,
});

export type LineSegmentOutput = Infer<typeof LineSegmentOutput>;
export const LineSegmentOutput = struct({
  vertexPosition: vec2f,
  situationIndex: u32,
});

export type LineSegmentVertexData = Infer<typeof LineSegmentVertexData>;
export const LineSegmentVertexData = struct({
  along: f32,
  cross: f32,
  join: f32,
});
