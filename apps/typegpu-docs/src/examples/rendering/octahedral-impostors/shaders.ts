import { tgpu, d, std } from 'typegpu';
import { nearestView } from './implementations/nearest.ts';
import { blendedViews } from './implementations/blended.ts';
import { sampleParallaxFrame } from './implementations/parallax.ts';
import {
  captureRadius,
  frameBasis,
  frameLayer,
  impostorLayout,
  viewsPerAxis,
  projectFrame,
  sampleFrame,
  toFrameSpace,
} from './impostor.ts';

export const techniques = {
  Nearest: { select: nearestView, sample: sampleFrame, samples: 1 },
  Blended: { select: blendedViews, sample: sampleFrame, samples: 3 },
  Parallax: { select: blendedViews, sample: sampleParallaxFrame, samples: 3 },
};
export type Technique = keyof typeof techniques;
export const techniqueSlot = tgpu.slot(techniques.Parallax);

const varyings = {
  p0: d.vec3f,
  c0: d.interpolate('flat', d.vec3f),
  p1: d.vec3f,
  c1: d.interpolate('flat', d.vec3f),
  p2: d.vec3f,
  c2: d.interpolate('flat', d.vec3f),
  layers: d.interpolate('flat', d.vec3u),
  weights: d.interpolate('flat', d.vec3f),
};

export const impostorVertex = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { clipPosition: d.builtin.position, ...varyings },
})(({ vertexIndex }) => {
  'use gpu';
  const camera = impostorLayout.$.camera;
  const localCamera = camera.position.xyz;
  const direction = std.normalize(localCamera);
  const corner = d.vec2f(vertexIndex & 1, vertexIndex >>> 1) * 2 - 1;
  const basis = frameBasis(direction);
  const position = (basis.right * corner.x + basis.up * corner.y) * captureRadius;
  const selection = techniqueSlot.$.select(direction);
  return {
    clipPosition: camera.projection * (camera.view * d.vec4f(position, 1)),
    p0: toFrameSpace(position, selection.frames[0]),
    c0: toFrameSpace(localCamera, selection.frames[0]),
    p1: toFrameSpace(position, selection.frames[1]),
    c1: toFrameSpace(localCamera, selection.frames[1]),
    p2: toFrameSpace(position, selection.frames[2]),
    c2: toFrameSpace(localCamera, selection.frames[2]),
    layers: d.vec3u(
      frameLayer(selection.frames[0]),
      frameLayer(selection.frames[1]),
      frameLayer(selection.frames[2]),
    ),
    weights: selection.weights,
  };
});

export const impostorFragment = tgpu.fragmentFn({ in: varyings, out: d.vec4f })((input) => {
  'use gpu';
  let color =
    techniqueSlot.$.sample(projectFrame(input.p0, input.c0, input.layers.x)) * input.weights.x;
  if (techniqueSlot.$.samples === 3) {
    color +=
      techniqueSlot.$.sample(projectFrame(input.p1, input.c1, input.layers.y)) * input.weights.y;
    color +=
      techniqueSlot.$.sample(projectFrame(input.p2, input.c2, input.layers.z)) * input.weights.z;
  }
  if (color.a < 0.001) {
    std.discard();
  }
  // Mips contain premultiplied color; alpha becomes MSAA coverage
  return d.vec4f(color.rgb / color.a, color.a);
});

export const atlasFragment = ({ uv }: { uv: d.v2f }) => {
  'use gpu';
  const cell = std.min(std.floor(uv * viewsPerAxis), d.vec2f(viewsPerAxis - 1));
  return std.textureSampleLevel(
    impostorLayout.$.colorAtlas,
    impostorLayout.$.sampler,
    std.fract(uv * viewsPerAxis),
    frameLayer(cell),
    impostorLayout.$.mipBias,
  );
};
