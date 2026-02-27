// An implementation of "Radiance Cascades: A Novel Approach to Calculating Global Illumination."
// https://drive.google.com/file/d/1L6v1_7HY2X-LV3Ofb6oyTIxgEaP4LOI6/view
//
// This uses Radiance Cascades, or RC, to compute volumetric global illumination in 2D.
// Some tricks were pulled off with the help of youssef_afella to port with animations.
//
// RC is a method to parameterize the radiance function in a way where discrete ray intervals
// can be interpolated and made a continuous radiance field. RC has useful properties for
// global illumination where it produces fully converged radiance, or no noise. It can be
// implemented on top of any method for computing global illumination, in any number of dimensions.
//
// The algorithm has no dependency on scene complexity or the number of lights in the scene.
// Lights can be any size, and there are grid constructions that resolve 1px light sources like HRC.
//
// This particular implementation uses a simple grid and interpolator (manual bilinear), which introduces
// transmittance bias, or "ringing," and I employ some nonphysical tricks, "bilinear fix," to hide them.
// A separate issue exists with shadows where interpolation averages discontinuities to where low-variance
// or sharp shadows cannot be resolved. This can be fixed with a better probe construction like HRC.
//
// RC can be used for other purposes than just lighting. My favorite examples:
// - gravity simulator by @Suslik https://shadertoy.com/view/XcB3Ry
// - diffusion solver by AdrianM https://twitter.com/yaazarai/status/1994896819575558435
//
// Now that I have convinced you that RC is awesome and you must implement it into your game, onto the code:

import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// Behold, the one parameter of Radiance Cascades, BASE_INTERVAL_LENGTH.
// This is the minimum spatial resolution that the cascades can model at C0.
const BASE_INTERVAL_LENGTH = 0.3;

// Here is also a BASE_PROBE_SIZE (in px) to try out a sparser probe grid.
// I do a 2x2 or 4x4 probe grid for screen-space (3D) with later upscaling.
const BASE_PROBE_SIZE = 1;

// https://m4xc.dev/articles/fundamental-rc
const getIntervalScale = (cascadeIndex: number) => {
  'use gpu';
  if (cascadeIndex <= 0) {
    return 0.0;
  }
  return d.f32(1 << d.u32(2 * cascadeIndex));
};

const getIntervalRange = (cascadeIndex: number) => {
  'use gpu';
  return d
    .vec2f(
      getIntervalScale(cascadeIndex),
      getIntervalScale(cascadeIndex + 1),
    )
    .mul(BASE_INTERVAL_LENGTH);
};

export const coordToWorldPos = (coord: d.v2f, resolution: d.v2f) => {
  'use gpu';
  const center = resolution.mul(0.5);
  const relative = coord.sub(center);
  return relative.div(std.min(resolution.x, resolution.y) / 2);
};

const castInterval = (
  scene: d.texture2d<d.F32>,
  intervalStart: d.v2f,
  intervalEnd: d.v2f,
  cascadeIndex: number,
) => {
  'use gpu';
  const dir = intervalEnd.sub(intervalStart);
  const steps = 16 << d.u32(cascadeIndex);
  const stepSize = dir.div(d.f32(steps));

  let radiance = d.vec3f(0);
  let transmittance = d.f32(1.0);

  for (let i = d.u32(0); i < steps; i++) {
    const coord = intervalStart.add(stepSize.mul(d.f32(i)));
    const sceneColor = std.textureLoad(scene, d.vec2i(coord), 0);
    radiance = radiance.add(
      sceneColor.xyz.mul(transmittance).mul(sceneColor.w),
    );
    transmittance *= 1.0 - sceneColor.w;
  }

  return d.vec4f(radiance, transmittance);
};

const mergeIntervals = (near: d.v4f, far: d.v4f) => {
  'use gpu';
  const radiance = near.xyz.add(far.xyz.mul(near.w));
  return d.vec4f(radiance, near.w * far.w);
};

const getBilinearWeights = (ratio: d.v2f) => {
  'use gpu';
  return d.vec4f(
    (1.0 - ratio.x) * (1.0 - ratio.y),
    ratio.x * (1.0 - ratio.y),
    (1.0 - ratio.x) * ratio.y,
    ratio.x * ratio.y,
  );
};

const getBilinearOffset = (offsetIndex: number) => {
  'use gpu';
  const offsets = [d.vec2i(0, 0), d.vec2i(1, 0), d.vec2i(0, 1), d.vec2i(1, 1)];
  return offsets[offsetIndex];
};

// sampler2D cascadeTexture
export const castAndMerge = (
  scene: d.texture2d<d.F32>,
  texture: d.texture2d<d.F32>,
  cascadeIndex: number,
  fragCoord: d.v2f,
  resolution: d.v2f,
  bilinearFix: number,
  cascadesNumber: number,
) => {
  'use gpu';
  // Probe parameters for cascade N
  const probeSize = d.i32(BASE_PROBE_SIZE << d.u32(cascadeIndex));
  const probeCenter = std.floor(fragCoord.div(d.f32(probeSize))).add(0.5);
  const probePosition = probeCenter.mul(d.f32(probeSize));

  // Interval parameters at cascade N
  const dirCoord = std.mod(d.vec2i(fragCoord), probeSize);
  const dirIndex = dirCoord.x + dirCoord.y * probeSize;
  const dirCount = probeSize * probeSize;

  // Interval direction at cascade N
  const angle = 2.0 * Math.PI * ((d.f32(dirIndex) + 0.5) / d.f32(dirCount));
  const dir = d.vec2f(std.cos(angle), std.sin(angle));

  let radiance = d.vec4f(0, 0, 0, 1);

  // Trace radiance interval at cascade N
  const intervalRange = getIntervalRange(cascadeIndex);
  const intervalStart = probePosition.add(dir.mul(intervalRange.x));
  const intervalEnd = probePosition.add(dir.mul(intervalRange.y));
  let destInterval = castInterval(
    scene,
    intervalStart,
    intervalEnd,
    cascadeIndex,
  );

  // Skip merge and only trace on the last cascade (computed back-to-front)
  // This can instead merge with sky radiance or an envmap
  if (cascadeIndex === cascadesNumber - 1) {
    return destInterval;
  }

  // Merge cascade N+1 -> cascade N
  const bilinearProbeSize = d.i32(BASE_PROBE_SIZE << d.u32(cascadeIndex + 1));
  const bilinearBaseCoord = probePosition.div(d.f32(bilinearProbeSize)).sub(
    0.5,
  );
  const ratio = std.fract(bilinearBaseCoord);
  const weights = getBilinearWeights(ratio);
  const baseIndex = d.vec2i(std.floor(bilinearBaseCoord));

  // Merge with upper 4 probes from cascade N+1
  // This could be done with hardware interpolation but OES_texture_float_linear support is spotty
  // Ideally, a smaller float buffer format would be used like RGBA16F or RG11FB10F for cascades
  for (let b = d.u32(0); b < 4; b++) {
    // Probe parameters for cascade N+1
    const baseOffset = getBilinearOffset(b);
    const bilinearIndex = std.clamp(
      baseIndex.add(baseOffset),
      d.vec2i(0),
      d.vec2i(resolution).div(bilinearProbeSize).sub(1),
    );
    const bilinearPosition = d.vec2f(bilinearIndex).add(0.5).mul(
      d.f32(bilinearProbeSize),
    );

    // Cast 4 locally interpolated intervals at cascade N -> cascade N+1 (bilinear fix)
    if (bilinearFix === 1) {
      const intervalRange = getIntervalRange(cascadeIndex);
      const intervalStart = probePosition.add(dir.mul(intervalRange.x));
      const intervalEnd = bilinearPosition.add(dir.mul(intervalRange.y));
      destInterval = castInterval(
        scene,
        intervalStart,
        intervalEnd,
        cascadeIndex,
      );
    }

    // Sample and interpolate 4 probe directions
    let bilinearRadiance = d.vec4f(0.0);
    for (let dd = 0; dd < 4; dd++) {
      // Fetch and merge with interval dd at probe b from cascade N+1
      const baseDirIndex = dirIndex * 4;
      const bilinearDirIndex = baseDirIndex + dd;
      const bilinearDirCoord = d.vec2i(
        bilinearDirIndex % bilinearProbeSize,
        bilinearDirIndex / bilinearProbeSize,
      );
      const bilinearTexel = bilinearIndex.mul(bilinearProbeSize).add(
        bilinearDirCoord,
      );
      const bilinearInterval = std.textureLoad(
        texture,
        bilinearTexel,
        0,
      );
      bilinearRadiance = bilinearRadiance.add(
        mergeIntervals(destInterval, bilinearInterval).mul(weights[b]),
      );
    }

    // Average of 4 bilinear samples
    radiance = radiance.add(bilinearRadiance.mul(0.25));
  }

  return radiance;
};
