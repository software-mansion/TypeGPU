import {
  tgpu,
  d,
  std,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuSampler,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import { Config, defaults } from './config.ts';

type Rgba16Texture = TgpuTexture & SampledFlag & StorageFlag;
type R32Texture = TgpuTexture & SampledFlag & StorageFlag;
type NoiseCache = ReturnType<typeof perlin3d.staticCache>;

export const smokeLayout = tgpu.bindGroupLayout({
  linearSampler: { sampler: 'filtering' },
  nearestSampler: { sampler: 'filtering' },
  inTex: { texture: d.texture2d(d.f32) },
  outTex: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  sourceTex: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
  textSourceTex: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
});

export const divergenceLayout = tgpu.bindGroupLayout({
  divTex: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  textFillTex: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
});

export const pressureLayout = tgpu.bindGroupLayout({
  nearestSampler: { sampler: 'filtering' },
  inTex: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
  outTex: { storageTexture: d.textureStorage2d('r32float', 'write-only') },
  divTex: { texture: d.texture2d(d.f32) },
});

export const gradientLayout = tgpu.bindGroupLayout({
  nearestSampler: { sampler: 'filtering' },
  inSmokeTex: { texture: d.texture2d(d.f32) },
  outSmokeTex: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  pressureTex: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
});

export const clearPressureLayout = tgpu.bindGroupLayout({
  tex: { storageTexture: d.textureStorage2d('r32float', 'write-only') },
});

export function createFluidPipelines(
  root: TgpuRoot,
  configUniform: TgpuUniform<typeof Config>,
  noiseCache: NoiseCache,
) {
  const advection = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const dt = configUniform.$.dt;

    const size = d.vec2f(std.textureDimensions(smokeLayout.$.inTex));
    const uv = (d.vec2f(x, y) + 0.5) / size;

    const thisState = std.textureSampleLevel(
      smokeLayout.$.inTex,
      smokeLayout.$.nearestSampler,
      uv,
      0.0,
    );

    const currentFlow = thisState.xy;
    const oldUv = uv - (currentFlow * dt) / size;

    let newState = std.textureSampleLevel(
      smokeLayout.$.inTex,
      smokeLayout.$.linearSampler,
      oldUv,
      0.0,
    );

    const brushSource = std.textureLoad(smokeLayout.$.sourceTex, d.vec2u(x, y)).x;
    const textSource = std.textureLoad(smokeLayout.$.textSourceTex, d.vec2u(x, y)).x;
    const source = std.max(brushSource, textSource);
    const heat = std.max(brushSource, textSource * defaults.textStartTemperature);
    if (source > 0.0) {
      newState.z = std.max(newState.z, source);
      newState.w = std.max(newState.w, heat);
    }

    const isDown = configUniform.$.isMouseDown;
    if (isDown === 1) {
      const bMode = configUniform.$.brushMode;
      if (bMode !== 1) {
        const pos = configUniform.$.stampPos;
        const radius = configUniform.$.radius;
        const softBrush = configUniform.$.isSoft;

        const dist = std.distance(d.vec2f(x, y), d.vec2f(pos));
        const fRadius = d.f32(radius);

        if (dist <= fRadius) {
          let weight = d.f32(1.0);
          if (softBrush === 1) {
            weight = d.f32(1.0) - std.smoothstep(fRadius * 0.1, fRadius, dist);
          }

          if (bMode === 0 || bMode === 2) {
            newState.z = std.max(newState.z, weight);
            newState.w = std.max(newState.w, weight);
            const v = configUniform.$.velocity;
            newState.x += v.x * weight * 0.15;
            newState.y += v.y * weight * 0.15;
          }
        }
      }
    }

    newState.z *= configUniform.$.densityDecay;
    newState.w *= configUniform.$.tempDecay;

    std.textureStore(smokeLayout.$.outTex, d.vec2u(x, y), newState);
  });

  const divergence = root.createGuardedComputePipeline((x, y) => {
    'use gpu';

    const size = d.vec2i(std.textureDimensions(smokeLayout.$.inTex));
    const xi = d.i32(x);
    const yi = d.i32(y);

    const xL = std.max(0, xi - 1);
    const xR = std.min(size.x - 1, xi + 1);
    const yT = std.max(0, yi - 1);
    const yB = std.min(size.y - 1, yi + 1);

    const vL = std.textureLoad(smokeLayout.$.inTex, d.vec2i(xL, yi), 0).xy;
    const vR = std.textureLoad(smokeLayout.$.inTex, d.vec2i(xR, yi), 0).xy;
    const vT = std.textureLoad(smokeLayout.$.inTex, d.vec2i(xi, yT), 0).xy;
    const vB = std.textureLoad(smokeLayout.$.inTex, d.vec2i(xi, yB), 0).xy;

    let div = 0.5 * (vR.x - vL.x + (vB.y - vT.y));

    // volume source inside the letters: lowering the Poisson RHS here raises
    // the solved pressure, so the projection pushes fluid out through the outline
    const fill = std.textureLoad(divergenceLayout.$.textFillTex, d.vec2i(xi, yi), 0).x;
    div -= fill * configUniform.$.textInsidePressure;

    std.textureStore(divergenceLayout.$.divTex, d.vec2u(x, y), d.vec4f(div, 0.0, 0.0, 1.0));
  });

  const pressureSolverJacobi = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const size = d.vec2i(std.textureDimensions(pressureLayout.$.inTex));
    const xi = d.i32(x);
    const yi = d.i32(y);

    const xL = std.max(0, xi - 1);
    const xR = std.min(size.x - 1, xi + 1);
    const yT = std.max(0, yi - 1);
    const yB = std.min(size.y - 1, yi + 1);

    const pL = std.textureLoad(pressureLayout.$.inTex, d.vec2i(xL, yi)).x;
    const pR = std.textureLoad(pressureLayout.$.inTex, d.vec2i(xR, yi)).x;
    const pT = std.textureLoad(pressureLayout.$.inTex, d.vec2i(xi, yT)).x;
    const pB = std.textureLoad(pressureLayout.$.inTex, d.vec2i(xi, yB)).x;

    const uv = (d.vec2f(x, y) + 0.5) / d.vec2f(size);
    const div = std.textureSampleLevel(
      pressureLayout.$.divTex,
      pressureLayout.$.nearestSampler,
      uv,
      0.0,
    ).x;

    const newPressure = (pL + pR + pT + pB - div) * 0.25;

    std.textureStore(pressureLayout.$.outTex, d.vec2u(x, y), d.vec4f(newPressure, 0.0, 0.0, 1.0));
  });

  const gradientSubtraction = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const size = d.vec2i(std.textureDimensions(gradientLayout.$.pressureTex));
    const xi = d.i32(x);
    const yi = d.i32(y);

    const xL = std.max(0, xi - 1);
    const xR = std.min(size.x - 1, xi + 1);
    const yT = std.max(0, yi - 1);
    const yB = std.min(size.y - 1, yi + 1);

    const pL = std.textureLoad(gradientLayout.$.pressureTex, d.vec2i(xL, yi)).x;
    const pR = std.textureLoad(gradientLayout.$.pressureTex, d.vec2i(xR, yi)).x;
    const pT = std.textureLoad(gradientLayout.$.pressureTex, d.vec2i(xi, yT)).x;
    const pB = std.textureLoad(gradientLayout.$.pressureTex, d.vec2i(xi, yB)).x;

    const grad = d.vec2f(pR - pL, pB - pT) * 0.5;

    const uv = (d.vec2f(x, y) + 0.5) / d.vec2f(size);
    const oldSmoke = std.textureSampleLevel(
      gradientLayout.$.inSmokeTex,
      gradientLayout.$.nearestSampler,
      uv,
      0.0,
    );

    let newVel = oldSmoke.xy - grad;

    if (x === 0 || xi === size.x - 1) {
      newVel.x = 0.0;
    }
    if (y === 0 || yi === size.y - 1) {
      newVel.y = 0.0;
    }

    std.textureStore(
      gradientLayout.$.outSmokeTex,
      d.vec2u(x, y),
      d.vec4f(newVel, oldSmoke.z, oldSmoke.w),
    );
  });

  const vorticityConfinement = root
    .pipe(noiseCache.inject())
    .createGuardedComputePipeline((x, y) => {
      'use gpu';
      const size = d.vec2f(std.textureDimensions(smokeLayout.$.inTex));
      const texelSize = 1.0 / size;
      const uv = (d.vec2f(x, y) + 0.5) * texelSize;

      if (
        x <= 2 ||
        x >= std.textureDimensions(smokeLayout.$.inTex).x - 3 ||
        y <= 2 ||
        y >= std.textureDimensions(smokeLayout.$.inTex).y - 3
      ) {
        const state = std.textureSampleLevel(
          smokeLayout.$.inTex,
          smokeLayout.$.nearestSampler,
          uv,
          0.0,
        );
        std.textureStore(smokeLayout.$.outTex, d.vec2u(x, y), state);
        return;
      }

      const vC = std.textureSampleLevel(smokeLayout.$.inTex, smokeLayout.$.nearestSampler, uv, 0.0);
      const vL = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv - d.vec2f(texelSize.x, 0.0),
        0.0,
      );
      const vR = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(texelSize.x, 0.0),
        0.0,
      );
      const vT = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv - d.vec2f(0.0, texelSize.y),
        0.0,
      );
      const vB = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(0.0, texelSize.y),
        0.0,
      );

      const vLL = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv - d.vec2f(2.0 * texelSize.x, 0.0),
        0.0,
      ).xy;
      const vRR = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(2.0 * texelSize.x, 0.0),
        0.0,
      ).xy;
      const vTT = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv - d.vec2f(0.0, 2.0 * texelSize.y),
        0.0,
      ).xy;
      const vBB = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(0.0, 2.0 * texelSize.y),
        0.0,
      ).xy;

      const vLT = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(-texelSize.x, -texelSize.y),
        0.0,
      ).xy;
      const vLB = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(-texelSize.x, texelSize.y),
        0.0,
      ).xy;
      const vRT = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(texelSize.x, -texelSize.y),
        0.0,
      ).xy;
      const vRB = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv + d.vec2f(texelSize.x, texelSize.y),
        0.0,
      ).xy;

      const curlC = 0.5 * (vR.y - vL.y - (vB.x - vT.x));
      const curlL = 0.5 * (vC.y - vLL.y - (vLB.x - vLT.x));
      const curlR = 0.5 * (vRR.y - vC.y - (vRB.x - vRT.x));
      const curlT = 0.5 * (vRT.y - vLT.y - (vC.x - vTT.x));
      const curlB = 0.5 * (vRB.y - vLB.y - (vBB.x - vC.x));

      const etaX = 0.5 * (std.abs(curlR) - std.abs(curlL));
      const etaY = 0.5 * (std.abs(curlB) - std.abs(curlT));

      let force = d.vec2f(0.0);
      const etaLen = std.length(d.vec2f(etaX, etaY));
      if (etaLen > 0.0001) {
        const nx = etaX / etaLen;
        const ny = etaY / etaLen;
        force = d.vec2f(ny * curlC, -nx * curlC);
      }

      const gradTx = 0.5 * (vR.w - vL.w);
      const gradTy = 0.5 * (vB.w - vT.w);
      const gradTLen = std.length(d.vec2f(gradTx, gradTy));
      let thermalForce = d.vec2f(0.0);
      if (gradTLen > 0.0001) {
        const nx = gradTx / gradTLen;
        const ny = gradTy / gradTLen;
        thermalForce = d.vec2f(ny * curlC, -nx * curlC);
      }

      const vorticityStrength = configUniform.$.vorticityStrength;
      const thermalStrength = configUniform.$.thermalStrength;
      const dt = configUniform.$.dt;

      const state = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.nearestSampler,
        uv,
        0.0,
      );

      const buoyancyForce = d.vec2f(0.0, -configUniform.$.buoyancy * state.w);

      const time = configUniform.$.time;
      const noiseVal = perlin3d.sample(d.vec3f(uv.x * size.x * 0.02, uv.y * size.y * 0.02, time));
      const windForce = d.vec2f(noiseVal * 40.0 * state.w, 0.0);

      let newVel =
        state.xy +
        force * vorticityStrength * dt +
        thermalForce * thermalStrength * dt +
        buoyancyForce * dt +
        windForce * dt;

      const maxVel = d.f32(1000.0);
      const velLen = std.length(newVel);
      if (velLen > maxVel) {
        newVel = (newVel / velLen) * maxVel;
      }

      if (x === 0 || x === std.textureDimensions(smokeLayout.$.inTex).x - 1) newVel.x = 0.0;
      if (y === 0 || y === std.textureDimensions(smokeLayout.$.inTex).y - 1) newVel.y = 0.0;

      std.textureStore(smokeLayout.$.outTex, d.vec2u(x, y), d.vec4f(newVel, state.z, state.w));
    });

  const clearPressure = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    std.textureStore(clearPressureLayout.$.tex, d.vec2u(x, y), d.vec4f(0.0));
  });

  return {
    advection,
    vorticityConfinement,
    divergence,
    pressureSolverJacobi,
    gradientSubtraction,
    clearPressure,
  };
}

export function createFluidBindGroups(
  root: TgpuRoot,
  resources: {
    linearSampler: TgpuSampler;
    nearestSampler: TgpuSampler;
    smokeGrid: [Rgba16Texture, Rgba16Texture];
    constantSourceGrid: R32Texture;
    textSourceGrid: R32Texture;
    textFillGrid: R32Texture;
    pressureGrid: [R32Texture, R32Texture];
    divergenceGrid: Rgba16Texture;
  },
) {
  const {
    linearSampler,
    nearestSampler,
    smokeGrid,
    constantSourceGrid,
    textSourceGrid,
    textFillGrid,
    pressureGrid,
    divergenceGrid,
  } = resources;

  const smokeBgs: [TgpuBindGroup, TgpuBindGroup] = [
    root.createBindGroup(smokeLayout, {
      linearSampler,
      nearestSampler,
      inTex: smokeGrid[0],
      outTex: smokeGrid[1],
      sourceTex: constantSourceGrid,
      textSourceTex: textSourceGrid,
    }),
    root.createBindGroup(smokeLayout, {
      linearSampler,
      nearestSampler,
      inTex: smokeGrid[1],
      outTex: smokeGrid[0],
      sourceTex: constantSourceGrid,
      textSourceTex: textSourceGrid,
    }),
  ];

  const divergenceBg = root.createBindGroup(divergenceLayout, {
    divTex: divergenceGrid,
    textFillTex: textFillGrid,
  });

  const pressureBgs: [TgpuBindGroup, TgpuBindGroup] = [
    root.createBindGroup(pressureLayout, {
      nearestSampler,
      inTex: pressureGrid[0],
      outTex: pressureGrid[1],
      divTex: divergenceGrid,
    }),
    root.createBindGroup(pressureLayout, {
      nearestSampler,
      inTex: pressureGrid[1],
      outTex: pressureGrid[0],
      divTex: divergenceGrid,
    }),
  ];

  const gradientBgs: [TgpuBindGroup, TgpuBindGroup] = [
    root.createBindGroup(gradientLayout, {
      nearestSampler,
      inSmokeTex: smokeGrid[0],
      outSmokeTex: smokeGrid[1],
      pressureTex: pressureGrid[0],
    }),
    root.createBindGroup(gradientLayout, {
      nearestSampler,
      inSmokeTex: smokeGrid[1],
      outSmokeTex: smokeGrid[0],
      pressureTex: pressureGrid[0],
    }),
  ];

  const clearPressureBgs: [TgpuBindGroup, TgpuBindGroup] = [
    root.createBindGroup(clearPressureLayout, { tex: pressureGrid[0] }),
    root.createBindGroup(clearPressureLayout, { tex: pressureGrid[1] }),
  ];

  return {
    smokeBgs,
    divergenceBg,
    pressureBgs,
    gradientBgs,
    clearPressureBgs,
  };
}
