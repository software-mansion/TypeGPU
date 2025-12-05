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

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// Behold, the one parameter of Radiance Cascades, BASE_INTERVAL_LENGTH.
// This is the minimum spatial resolution that the cascades can model at C0.
const BASE_INTERVAL_LENGTH = 0.2;

// Here is also a BASE_PROBE_SIZE (in px) to try out a sparser probe grid.
// I do a 2x2 or 4x4 probe grid for screen-space (3D) with later upscaling.
const BASE_PROBE_SIZE = 1;

// https://iquilezles.org/articles/distfunctions2d
const circle = tgpu.fn([d.vec4f, d.vec2f, d.f32, d.vec4f], d.vec4f)(
  (color, position, radius, albedo) => {
    'use gpu';
    const sanitizedRadius = std.max(0.5, radius);
    if (std.length(position) - sanitizedRadius < sanitizedRadius) {
      color = albedo;
    }
    return color;
  },
);

const getSceneColor = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec4f)(
  (coord, resolution, time) => {
    'use gpu';
    const center = (resolution.xy.mul(0.5)).sub(coord);
    let color = d.vec4f(0.0);
    color = circle(
      color,
      d.vec2f(-250, 0).add(center),
      (std.sin(time) * 0.5 + 0.5) * 50.0,
      d.vec4f(1, 0.5, 0, 1),
    );
    color = circle(
      color,
      d.vec2f(0, std.sin(time) * 250.0).add(center),
      50.0,
      d.vec4f(0, 0, 0, 0.01),
    );
    color = circle(
      color,
      d.vec2f(250, 0).add(center),
      (-std.sin(time) * 0.5 + 0.5) * 50.0,
      d.vec4f(1, 1, 1, 1),
    );
    return color;
  },
);

// https://m4xc.dev/articles/fundamental-rc
const getIntervalScale = tgpu.fn([d.i32], d.f32)((cascadeIndex) => {
  'use gpu';
  if (cascadeIndex <= 0) {
    return 0.0;
  }
  return d.f32(1 << (2 * cascadeIndex));
});

const getIntervalRange = tgpu.fn([d.i32], d.vec2f)((cascadeIndex) => {
  'use gpu';
  return d
    .vec2f(
      getIntervalScale(cascadeIndex),
      getIntervalScale(cascadeIndex + 1),
    )
    .mul(BASE_INTERVAL_LENGTH);
});

const castInterval = tgpu.fn(
  [d.vec2f, d.vec2f, d.i32, d.vec2f, d.f32],
  d.vec4f,
)(
  (intervalStart, intervalEnd, cascadeIndex, resolution, time) => {
    'use gpu';
    const dir = intervalEnd.sub(intervalStart);
    const steps = 16 << cascadeIndex;
    const stepSize = dir.div(d.f32(steps));

    let radiance = d.vec3f(0);
    let transmittance = 1.0;

    for (let i = 0; i < steps; i++) {
      const coord = intervalStart.add(stepSize.mul(d.f32(i)));
      const scene = getSceneColor(coord, resolution, time);
      radiance = radiance.add(scene.xyz.mul(transmittance).mul(scene.w));
      transmittance = transmittance * (1.0 - scene.w);
    }

    return d.vec4f(radiance, transmittance);
  },
);

const mergeIntervals = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)((near, far) => {
  'use gpu';
  const radiance = near.xyz.add(far.xyz.mul(near.w));
  return d.vec4f(radiance, near.w * far.w);
});

const getBilinearWeights = tgpu.fn([d.vec2f], d.vec4f)((ratio) => {
  'use gpu';
  return d.vec4f(
    (1.0 - ratio.x) * (1.0 - ratio.y),
    ratio.x * (1.0 - ratio.y),
    (1.0 - ratio.x) * ratio.y,
    ratio.x * ratio.y,
  );
});

const getBilinearOffset = tgpu.fn([d.i32], d.vec2i)((offsetIndex) => {
  'use gpu';
  const offsets = [d.vec2i(0, 0), d.vec2i(1, 0), d.vec2i(0, 1), d.vec2i(1, 1)];
  return offsets[offsetIndex];
});

const NUM_CASCADES = 6;

// sampler2D cascadeTexture
const castAndMerge = tgpu.fn([d.i32, d.vec2f, d.vec2f, d.f32], d.vec4f)(
  (cascadeIndex, fragCoord, resolution, time) => {
    'use gpu';
    // Probe parameters for cascade N
    const probeSize = d.i32(BASE_PROBE_SIZE << cascadeIndex);
    const probeCenter = std.floor(fragCoord.xy.div(probeSize)).add(0.5);
    const probePosition = probeCenter.mul(probeSize);

    // Interval parameters at cascade N
    const dirCoord = std.mod(d.vec2i(fragCoord.xy), probeSize);
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
    const destInterval = castInterval(
      intervalStart,
      intervalEnd,
      cascadeIndex,
      resolution,
      time,
    );

    // Skip merge and only trace on the last cascade (computed back-to-front)
    // This can instead merge with sky radiance or an envmap
    if (cascadeIndex === NUM_CASCADES - 1) {
      return destInterval;
    }

    // Merge cascade N+1 -> cascade N
    const bilinearProbeSize = d.i32(BASE_PROBE_SIZE << (cascadeIndex + 1));
    const bilinearBaseCoord = (probePosition.div(bilinearProbeSize)).sub(0.5);
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
        bilinearProbeSize,
      );

      // Cast 4 locally interpolated intervals at cascade N -> cascade N+1 (bilinear fix)
      const intervalRange = getIntervalRange(cascadeIndex);
      const intervalStart = probePosition.add(dir.mul(intervalRange.x));
      const intervalEnd = bilinearPosition.add(dir.mul(intervalRange.y));
      const destInterval = castInterval(
        intervalStart,
        intervalEnd,
        cascadeIndex,
        resolution,
        time,
      );

      // Sample and interpolate 4 probe directions
      let bilinearRadiance = d.vec4f(0.0);
      for (let dd = 0; dd < 4; dd++) {
        // Fetch and merge with interval d at probe b from cascade N+1
        const baseDirIndex = dirIndex * 4;
        const bilinearDirIndex = baseDirIndex + dd;
        const bilinearDirCoord = d.vec2i(
          bilinearDirIndex % bilinearProbeSize,
          bilinearDirIndex / bilinearProbeSize,
        );
        const bilinearTexel = bilinearIndex.mul(
          bilinearDirCoord.add(bilinearProbeSize),
        );
        const bilinearInterval = std.textureLoad(
          cascadeTexture,
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
  },
);
