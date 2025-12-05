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

// void getBilinearSamples(vec2 baseCoord, out vec4 weights, out ivec2 baseIndex) {
//     vec2 ratio = fract(baseCoord);
//     weights = getBilinearWeights(ratio);
//     baseIndex = ivec2(floor(baseCoord));
// }

const getBilinearOffset = tgpu.fn([d.i32], d.vec2i)((offsetIndex) => {
  'use gpu';
  const offsets = [d.vec2i(0, 0), d.vec2i(1, 0), d.vec2i(0, 1), d.vec2i(1, 1)];
  return offsets[offsetIndex];
});

const NUM_CASCADES = 6;

// vec4 castAndMerge(sampler2D cascadeTexture, int cascadeIndex, vec2 fragCoord, vec2 resolution, float time) {
//     // Probe parameters for cascade N
//     int probeSize = BASE_PROBE_SIZE << cascadeIndex;
//     vec2 probeCenter = floor(fragCoord.xy / float(probeSize)) + 0.5;
//     vec2 probePosition = probeCenter * float(probeSize);

//     // Interval parameters at cascade N
//     ivec2 dirCoord = ivec2(fragCoord.xy) % probeSize;
//     int dirIndex = dirCoord.x + dirCoord.y * probeSize;
//     int dirCount = probeSize * probeSize;

//     // Interval direction at cascade N
//     float angle = 2.0 * PI * ((float(dirIndex) + 0.5) / float(dirCount));
//     vec2 dir = vec2(cos(angle), sin(angle));

//     vec4 radiance = vec4(0, 0, 0, 1);

//     // Trace radiance interval at cascade N
//     vec2 intervalRange = getIntervalRange(cascadeIndex);
//     vec2 intervalStart = probePosition + dir * intervalRange.x;
//     vec2 intervalEnd = probePosition + dir * intervalRange.y;
//     vec4 destInterval = castInterval(intervalStart, intervalEnd, cascadeIndex, resolution, time);

//     // Skip merge and only trace on the last cascade (computed back-to-front)
//     // This can instead merge with sky radiance or an envmap
//     if (cascadeIndex == NUM_CASCADES - 1) {
//         return destInterval;
//     }

//     // Merge cascade N+1 -> cascade N
//     vec4 weights;
//     ivec2 baseIndex;
//     int bilinearProbeSize = BASE_PROBE_SIZE << (cascadeIndex + 1);
//     vec2 bilinearBaseCoord = (probePosition / float(bilinearProbeSize)) - 0.5;
//     getBilinearSamples(bilinearBaseCoord, weights, baseIndex);

//     // Merge with upper 4 probes from cascade N+1
//     // This could be done with hardware interpolation but OES_texture_float_linear support is spotty
//     // Ideally, a smaller float buffer format would be used like RGBA16F or RG11FB10F for cascades
//     for (int b = 0; b < 4; b++) {
//         // Probe parameters for cascade N+1
//         ivec2 baseOffset = getBilinearOffset(b);
//         ivec2 bilinearIndex = clamp(baseIndex + baseOffset, ivec2(0), ivec2(resolution) / bilinearProbeSize - 1);
//         vec2 bilinearPosition = (vec2(bilinearIndex) + 0.5) * float(bilinearProbeSize);

//       #ifdef BILINEAR_FIX
//         // Cast 4 locally interpolated intervals at cascade N -> cascade N+1 (bilinear fix)
//         vec2 intervalRange = getIntervalRange(cascadeIndex);
//         vec2 intervalStart = probePosition + dir * intervalRange.x;
//         vec2 intervalEnd = bilinearPosition + dir * intervalRange.y;
//         vec4 destInterval = castInterval(intervalStart, intervalEnd, cascadeIndex, resolution, time);
//       #endif

//         // Sample and interpolate 4 probe directions
//         vec4 bilinearRadiance = vec4(0.0);
//         for (int d = 0; d < 4; d++) {
//             // Fetch and merge with interval d at probe b from cascade N+1
//             int baseDirIndex = dirIndex * 4;
//             int bilinearDirIndex = baseDirIndex + d;
//             ivec2 bilinearDirCoord = ivec2(bilinearDirIndex % bilinearProbeSize, bilinearDirIndex / bilinearProbeSize);
//             ivec2 bilinearTexel = bilinearIndex * bilinearProbeSize + bilinearDirCoord;
//             vec4 bilinearInterval = texelFetch(cascadeTexture, bilinearTexel, 0);
//             bilinearRadiance += mergeIntervals(destInterval, bilinearInterval) * weights[b];
//         }

//         // Average of 4 bilinear samples
//         radiance += bilinearRadiance * 0.25;
//     }

//     return radiance;
// }
