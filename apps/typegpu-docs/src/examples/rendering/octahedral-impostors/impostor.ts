import { tgpu, d, std } from 'typegpu';
import { Camera } from '../../common/setup-orbit-camera.ts';

export const captureRadius = 1.6;
export const captureDistance = 3;
export const modelRadius = 1.4;

export const viewsPerAxis = 15;
export const frameResolution = 128;

export const impostorLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  mipBias: { uniform: d.f32 },
  colorAtlas: { texture: d.texture2dArray() },
  depthAtlas: { texture: d.texture2dArray(), sampleType: 'unfilterable-float' },
  sampler: { sampler: 'filtering' },
});

// Directions mapped onto the UV square (u right, v down):
//
//   -Y------ -Z ------ -Y
//    |      /   \      |
//    |    /       \    |
//   -X       +Y       +X
//    |    \       /    |
//    |      \   /      |
//   -Y------ +Z ------ -Y
//
// The diamond is the upper hemisphere (y >= 0); its boundary is the equator
// The lower hemisphere folds into the four corner triangles, which meet at -Y
export const octEncode = (direction: d.v3f) => {
  'use gpu';
  // Project onto the octahedron: |x| + |y| + |z| = 1
  const n = direction / (std.abs(direction.x) + std.abs(direction.y) + std.abs(direction.z));

  // Keep the upper diamond; mirror the lower faces out into the corners
  const sign = std.select(d.vec2f(-1), d.vec2f(1), std.ge(n.xz, d.vec2f(0)));
  const folded = (1 - std.abs(n.zx)) * sign;
  return std.select(n.xz, folded, n.y < 0) * 0.5 + 0.5;
};

export const octDecode = (uv: d.v2f) => {
  'use gpu';
  const f = uv * 2 - 1;
  // Recover octahedron height: negative outside the diamond
  const y = 1 - std.abs(f.x) - std.abs(f.y);

  // Fold the corners back underneath, then project onto the unit sphere
  const xz = f - std.sign(f) * std.max(-y, 0);
  return std.normalize(d.vec3f(xz.x, y, xz.y));
};

const FrameBasis = d.struct({ right: d.vec3f, up: d.vec3f });

export const frameBasis = (direction: d.v3f) => {
  'use gpu';
  const pole = std.select(d.vec3f(0, 1, 0), d.vec3f(0, 0, 1), std.abs(direction.y) > 0.99);
  const right = std.normalize(std.cross(pole, direction));
  return FrameBasis({ right, up: std.cross(direction, right) });
};

export const frameLayer = (coordinates: d.v2f) => {
  'use gpu';
  return d.u32(coordinates.y * viewsPerAxis + coordinates.x);
};

export const ViewSelection = d.struct({ frames: d.arrayOf(d.vec2f, 3), weights: d.vec3f });

export const toFrameSpace = (position: d.v3f, coordinates: d.v2f) => {
  'use gpu';
  const direction = octDecode(coordinates / (viewsPerAxis - 1));
  const basis = frameBasis(direction);
  return d.vec3f(
    std.dot(position, basis.right) / (2 * captureRadius),
    -std.dot(position, basis.up) / (2 * captureRadius),
    std.dot(position, direction),
  );
};

export const Frame = d.struct({
  uv: d.vec2f,
  uvSlope: d.vec2f,
  dx: d.vec2f,
  dy: d.vec2f,
  layer: d.u32,
});

export const projectFrame = (position: d.v3f, camera: d.v3f, layer: number) => {
  'use gpu';
  const ray = camera - position;
  const uvSlope = ray.xy / std.max(ray.z, 0.05);
  // Intersect the viewing ray with the capture plane (z = 0)
  const uv = position.xy + 0.5 - uvSlope * position.z;
  const mipScale = std.exp2(impostorLayout.$.mipBias);
  return Frame({
    uv,
    uvSlope,
    dx: std.dpdx(uv) * mipScale,
    dy: std.dpdy(uv) * mipScale,
    layer: d.u32(layer),
  });
};

export const sampleColor = (frame: d.InferGPU<typeof Frame>, uv: d.v2f) => {
  'use gpu';
  return std.textureSampleGrad(
    impostorLayout.$.colorAtlas,
    impostorLayout.$.sampler,
    uv,
    frame.layer,
    frame.dx,
    frame.dy,
  );
};

export const sampleFrame = (frame: d.InferGPU<typeof Frame>) => {
  'use gpu';
  return sampleColor(frame, frame.uv);
};
