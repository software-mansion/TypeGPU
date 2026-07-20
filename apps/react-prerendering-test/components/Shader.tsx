'use client';

import { useConfigureContext, useFrame, useRoot, useUniform } from '@typegpu/react';
import { useMemo } from 'react';
import { tgpu, common, d, std } from 'typegpu';
import { perlin2d } from '@typegpu/noise';
import { hexToOklab, oklabToRgb } from '@typegpu/color';

function noise(v: d.v2f) {
  'use gpu';
  return perlin2d.sample(v);
}

const octavesAccessor = tgpu.accessor(d.u32);
const standardizeNoiseAccessor = tgpu.accessor(d.bool);
const getMaxValue = tgpu.comptime((octaves: number) => 1 - 2 ** -octaves);
const rotation = d.mat2x2f(0.8, 0.6, -0.6, 0.8);

function fbm(v: d.v2f, time: number) {
  'use gpu';
  let u = d.vec2f(v);
  let f = d.f32();

  // first octave
  {
    let sample = noise(u + time);
    if (standardizeNoiseAccessor.$) sample = sample * 0.5 + 0.5;
    f += 0.5 * sample;
    u = rotation * u * 2.01;
  }

  for (const i of tgpu.unroll(std.range(2, octavesAccessor.$))) {
    let sample = noise(u);
    if (standardizeNoiseAccessor.$) sample = sample * 0.5 + 0.5;
    f += 0.5 ** i * sample;
    u = rotation * u * (2 + i / 100);
  }

  // last octave
  {
    let sample = noise(u + std.sin(time));
    if (standardizeNoiseAccessor.$) sample = sample * 0.5 + 0.5;
    f += 0.5 ** d.f32(octavesAccessor.$) * sample;
    u = rotation * u * 2.01;
  }

  return f / getMaxValue(octavesAccessor.$);
}

const fbm4 = tgpu.fn(fbm).with(octavesAccessor, 4).with(standardizeNoiseAccessor, false);
const fbm6 = tgpu.fn(fbm).with(octavesAccessor, 6).with(standardizeNoiseAccessor, true);

function domainWarp(v: d.v2f, time: number) {
  'use gpu';
  return fbm6(v + fbm4(v + fbm4(v, time), time), time);
}

function palette(t: number) {
  'use gpu';
  const purple = hexToOklab('#c04bf2');
  const blue = hexToOklab('#4e65f6');
  const dark = hexToOklab('#0f092b');

  const factor1 = std.smoothstep(0.25, 0.5, t);
  const factor2 = std.smoothstep(0.5, 0.7, t);

  const mixed = std.mix(std.mix(dark, blue, factor1), purple, factor2);
  return oklabToRgb(mixed);
}

export default function Shader() {
  const root = useRoot();
  const time = useUniform(d.f32);

  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          const centeredUV = (2 * uv - 1) * 4;

          const sample = domainWarp(centeredUV, time.$);
          const sampleRight = domainWarp(centeredUV + d.vec2f(0.04, 0), time.$);
          const sampleDown = domainWarp(centeredUV + d.vec2f(0, 0.04), time.$);

          const dx = d.vec3f(0.04, 0, (sampleRight - sample) * 0.4);
          const dy = d.vec3f(0, 0.04, (sampleDown - sample) * 0.4);
          const normal = std.normalize(std.cross(dx, dy));

          const lightDir = std.normalize(d.vec3f(0.0, -1.0, 1.0));
          const diffuse = std.max(0.0, std.dot(normal, lightDir));

          const baseColor = palette(sample);

          const litColor = baseColor * diffuse;

          return d.vec4f(litColor, 1);
        },
      }),
    [root, time],
  );

  const { ref, ctxRef } = useConfigureContext({ autoResize: true, alphaMode: 'premultiplied' });

  useFrame(({ elapsedSeconds }) => {
    if (!ctxRef.current) return;

    time.write(elapsedSeconds * 0.5);
    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return <canvas ref={ref} style={{ display: 'block', width: '80vmin', height: '80vmin' }} />;
}
