import { d } from 'typegpu';
import { LEVEL_COUNT, OFFSCREEN } from './constants.ts';

export const SdRect = d.struct({ center: d.vec2f, size: d.vec2f });

export const SdCircle = d.struct({
  center: d.align(16, d.vec2f),
  radius: d.f32,
  level: d.i32,
  angle: d.f32,
  speed: d.f32,
});

export const INACTIVE_CIRCLE = {
  center: d.vec2f(OFFSCREEN, OFFSCREEN),
  radius: 0,
  level: 0,
  angle: 0,
  speed: 0,
};

export const Frame = d.struct({
  time: d.f32,
  canvasAspect: d.f32,
  activeCount: d.u32,
  ghostCircle: SdCircle,
});

export const SceneHit = d.struct({ dist: d.f32, color: d.vec3f });

export interface ActiveFruit {
  level: number;
  radius: number;
  bodyIndex: number;
  dead: boolean;
  spawnTime: number;
  isMerge: boolean;
}

export const LEVEL_F32_ZEROS = Array.from({ length: LEVEL_COUNT }, () => 0);
export const LEVEL_V2F_ZEROS = Array.from(
  { length: LEVEL_COUNT },
  () => d.vec2f(),
);
