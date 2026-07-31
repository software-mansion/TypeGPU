import {
  tgpu,
  common,
  d,
  std,
  type SampledFlag,
  type StorageFlag,
  type TgpuRoot,
  type TgpuSampler,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import type { Config } from './config.ts';

type Rgba16Texture = TgpuTexture & SampledFlag & StorageFlag;

export const displayLayout = tgpu.bindGroupLayout({
  linearSampler: { sampler: 'filtering' },
  displayTex: { texture: d.texture2d(d.f32) },
});

export function smokeFragment(configUniform: TgpuUniform<typeof Config>) {
  return tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    'use gpu';
    const texel = std.textureSampleLevel(
      displayLayout.$.displayTex,
      displayLayout.$.linearSampler,
      uv,
      0,
    );
    const density = texel.z;
    const rawTemperature = texel.w;

    const temperature = std.pow(rawTemperature, configUniform.$.tempPower);

    // plancks law approximation (tanner helland algorithm)
    // map normalized temperature to kelvins (1000K to 4000K)
    const T = 1000.0 + temperature * 3000.0;
    const t = T / 100.0;

    let r = d.f32(0);
    if (t <= 66.0) {
      r = d.f32(255.0);
    } else {
      r = d.f32(329.698727446) * std.pow(t - 60.0, -0.1332047592);
    }

    let g = d.f32(0);
    if (t <= 66.0) {
      g = d.f32(99.4708025861) * std.log(t) - d.f32(161.1195681661);
    } else {
      g = d.f32(288.1221695283) * std.pow(t - 60.0, -0.0755148492);
    }

    let b = d.f32(0);
    if (t >= 66.0) {
      b = d.f32(255.0);
    } else if (t <= 19.0) {
      b = d.f32(0.0);
    } else {
      b = d.f32(138.5177312231) * std.log(t - 10.0) - d.f32(305.0447927307);
    }

    const color =
      d.vec3f(std.clamp(r, 0.0, 255.0), std.clamp(g, 0.0, 255.0), std.clamp(b, 0.0, 255.0)) / 255.0;
    const intensity = density * temperature * 2.5;

    const bgColor = d.vec3f(0.1, 0.1, 0.1);
    const smokeColor = d.vec3f(0.04, 0.04, 0.04);
    const fireColor = color * intensity;
    const fluidColor = fireColor + smokeColor;
    const finalColor = std.mix(bgColor, fluidColor, std.min(density, 1.0));

    return d.vec4f(finalColor, 1.0);
  });
}

export function densityFragment(_configUniform: TgpuUniform<typeof Config>) {
  return tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    'use gpu';
    const texel = std.textureSampleLevel(
      displayLayout.$.displayTex,
      displayLayout.$.linearSampler,
      uv,
      0,
    );
    const density = texel.z;

    const bgColor = d.vec3f(0.1, 0.1, 0.1);
    const densityColor = d.vec3f(density);
    const finalColor = std.mix(bgColor, densityColor, std.min(density, 1.0));

    return d.vec4f(finalColor, 1.0);
  });
}

export function velocityFragment(_configUniform: TgpuUniform<typeof Config>) {
  return tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    'use gpu';
    const texel = std.textureSampleLevel(
      displayLayout.$.displayTex,
      displayLayout.$.linearSampler,
      uv,
      0,
    );
    const vel = texel.xy;
    const speed = std.length(vel);

    const bgColor = d.vec3f(0.1, 0.1, 0.1);

    const normVel = vel * 0.02;
    const dirColor = d.vec3f(
      std.clamp(0.5 + normVel.x, 0.0, 1.0),
      std.clamp(0.5 + normVel.y, 0.0, 1.0),
      std.clamp(speed * 0.02, 0.0, 1.0),
    );

    const finalColor = std.mix(bgColor, dirColor, std.min(speed * 0.05, 1.0));

    return d.vec4f(finalColor, 1.0);
  });
}

export function createRenderPipelines(root: TgpuRoot, configUniform: TgpuUniform<typeof Config>) {
  return {
    firePipeline: root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: smokeFragment(configUniform),
    }),
    densityPipeline: root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: densityFragment(configUniform),
    }),
    velocityPipeline: root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: velocityFragment(configUniform),
    }),
  };
}

export function createDisplayBindGroups(
  root: TgpuRoot,
  {
    linearSampler,
    smokeGrid,
  }: {
    linearSampler: TgpuSampler;
    smokeGrid: [Rgba16Texture, Rgba16Texture];
  },
) {
  return [
    root.createBindGroup(displayLayout, {
      linearSampler,
      displayTex: smokeGrid[1],
    }),
    root.createBindGroup(displayLayout, {
      linearSampler,
      displayTex: smokeGrid[0],
    }),
  ];
}
