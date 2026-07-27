import tgpu, { d } from 'typegpu';

// prettier-ignore
export const faceOffsets = tgpu.const(d.arrayOf(d.vec3i, 4 * 6), [
  // 0: bottom (y-1)
  d.vec3i(1,0,0), d.vec3i(1,0,1), d.vec3i(0,0,0), d.vec3i(0,0,1),
  // 1: top (y+1)
  d.vec3i(1,1,1), d.vec3i(1,1,0), d.vec3i(0,1,1), d.vec3i(0,1,0),
  // 2: left (x-1)
  d.vec3i(0,1,1), d.vec3i(0,1,0), d.vec3i(0,0,1), d.vec3i(0,0,0),
  // 3: right (x+1)
  d.vec3i(1,0,1), d.vec3i(1,0,0), d.vec3i(1,1,1), d.vec3i(1,1,0),
  // 4: front (z+1)
  d.vec3i(0,1,1), d.vec3i(0,0,1), d.vec3i(1,1,1), d.vec3i(1,0,1),
  // 5: back (z-1)
  d.vec3i(0,0,0), d.vec3i(0,1,0), d.vec3i(1,0,0), d.vec3i(1,1,0),
])
