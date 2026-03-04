import type { ColorAttachment, TgpuRoot } from 'typegpu';
import tgpu, { d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import { BLUR_RADIUS, TAA_BLEND } from './constants.ts';
import { BloomParams } from './types.ts';

export const bloomParamsAccess = tgpu.accessor(BloomParams);

const taaResolveLayout = tgpu.bindGroupLayout({
  currentTexture: { texture: d.texture2d() },
  historyTexture: { texture: d.texture2d() },
  outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
});

const processLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d() },
  outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
  sampler: { sampler: 'filtering' },
});

const compositeLayout = tgpu.bindGroupLayout({
  colorTexture: { texture: d.texture2d() },
  bloomTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

function createProcessingTexture(root: TgpuRoot, width: number, height: number) {
  const texture = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  return {
    texture,
    writeView: texture.createView(d.textureStorage2d('rgba16float')),
    sampleView: texture.createView(d.texture2d(d.f32)),
  };
}

export function createPostProcessingPipelines(
  root: TgpuRoot,
  width: number,
  height: number,
  initialBloom: d.Infer<typeof BloomParams>,
) {
  const bloomUniform = root.createUniform(BloomParams, initialBloom);
  const bloomWidth = Math.max(1, Math.floor(width / 2));
  const bloomHeight = Math.max(1, Math.floor(height / 2));

  const result = createProcessingTexture(root, width, height);
  const bloom = createProcessingTexture(root, bloomWidth, bloomHeight);
  const blurTemp = createProcessingTexture(root, bloomWidth, bloomHeight);
  const history = createProcessingTexture(root, width, height);
  const taaOutput = createProcessingTexture(root, width, height);

  const sampler = root['~unstable'].createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const taaResolve = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const coord = d.vec2i(d.i32(x), d.i32(y));
    const current = std.textureLoad(taaResolveLayout.$.currentTexture, coord, 0);
    const historyColor = std.textureLoad(taaResolveLayout.$.historyTexture, coord, 0);

    let minColor = d.vec3f(9999);
    let maxColor = d.vec3f(-9999);

    for (const ox of tgpu.unroll([-1, 0, 1])) {
      for (const oy of tgpu.unroll([-1, 0, 1])) {
        const sampleCoord = coord + d.vec2i(ox, oy);
        const clampedCoord = std.clamp(
          sampleCoord,
          d.vec2i(0, 0),
          d.vec2i(d.i32(width) - 1, d.i32(height) - 1),
        );
        const neighbor = std.textureLoad(taaResolveLayout.$.currentTexture, clampedCoord, 0).rgb;
        minColor = std.min(minColor, neighbor);
        maxColor = std.max(maxColor, neighbor);
      }
    }

    const clampedHistory = std.clamp(historyColor.rgb, minColor, maxColor);
    const blended = std.mix(current.rgb, clampedHistory, TAA_BLEND);

    std.textureStore(taaResolveLayout.$.outputTexture, d.vec2u(x, y), d.vec4f(blended, 1));
  });

  const copyToHistory = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const color = std.textureLoad(processLayout.$.inputTexture, d.vec2i(d.i32(x), d.i32(y)), 0);
    std.textureStore(processLayout.$.outputTexture, d.vec2u(x, y), color);
  });

  const extractBright = root
    .with(bloomParamsAccess, bloomUniform)
    .createGuardedComputePipeline((x, y) => {
      'use gpu';
      const dimensions = std.textureDimensions(processLayout.$.outputTexture);
      const uv = (d.vec2f(x, y) + 0.5) / d.vec2f(dimensions);
      const color = std.textureSampleLevel(
        processLayout.$.inputTexture,
        processLayout.$.sampler,
        uv,
        0,
      );
      const brightness = std.dot(color.rgb, d.vec3f(0.2126, 0.7152, 0.0722));
      const threshold = bloomParamsAccess.$.threshold;
      const bright = std.max(brightness - threshold, 0) / std.max(brightness, 1e-4);
      const bloomColor = color.rgb * bright;
      std.textureStore(processLayout.$.outputTexture, d.vec2u(x, y), d.vec4f(bloomColor, 1));
    });

  const blurHorizontal = createBlurPass(root, 'horizontal');

  const blurVertical = createBlurPass(root, 'vertical');

  const fragmentMain = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    'use gpu';
    const color = std.textureSample(compositeLayout.$.colorTexture, compositeLayout.$.sampler, uv);
    const bloomColor = std.textureSample(
      compositeLayout.$.bloomTexture,
      compositeLayout.$.sampler,
      uv,
    );

    let final = color.rgb + bloomColor.rgb * bloomParamsAccess.$.intensity;

    const centeredUV = (uv - 0.5) * 2;
    const vignette = 1 - std.dot(centeredUV, centeredUV) * 0.15;
    final *= vignette;

    return d.vec4f(final, 1);
  });

  const renderPipeline = root.with(bloomParamsAccess, bloomUniform).createRenderPipeline({
    vertex: fullScreenTriangle,
    fragment: fragmentMain,
  });

  const taaBindGroup = root.createBindGroup(taaResolveLayout, {
    currentTexture: result.sampleView,
    historyTexture: history.sampleView,
    outputTexture: taaOutput.writeView,
  });

  const copyBindGroup = root.createBindGroup(processLayout, {
    inputTexture: taaOutput.sampleView,
    outputTexture: history.writeView,
    sampler,
  });

  const extractBindGroup = root.createBindGroup(processLayout, {
    inputTexture: result.sampleView,
    outputTexture: bloom.writeView,
    sampler,
  });

  const blurHorizontalBindGroup = root.createBindGroup(processLayout, {
    inputTexture: bloom.sampleView,
    outputTexture: blurTemp.writeView,
    sampler,
  });

  const blurVerticalBindGroup = root.createBindGroup(processLayout, {
    inputTexture: blurTemp.sampleView,
    outputTexture: bloom.writeView,
    sampler,
  });

  const compositeBindGroup = root.createBindGroup(compositeLayout, {
    colorTexture: taaOutput.sampleView,
    bloomTexture: bloom.sampleView,
    sampler,
  });

  return {
    result,
    bloomUniform,
    runTaa: () => {
      taaResolve.with(taaBindGroup).dispatchThreads(width, height);
      copyToHistory.with(copyBindGroup).dispatchThreads(width, height);
    },
    runBloom: () => {
      extractBright.with(extractBindGroup).dispatchThreads(bloomWidth, bloomHeight);
      blurHorizontal.with(blurHorizontalBindGroup).dispatchThreads(bloomWidth, bloomHeight);
      blurVertical.with(blurVerticalBindGroup).dispatchThreads(bloomWidth, bloomHeight);
    },
    render: (targetView: ColorAttachment['view']) => {
      renderPipeline.with(compositeBindGroup).withColorAttachment({ view: targetView }).draw(3);
    },
  };
}

function createBlurPass(root: TgpuRoot, direction: 'horizontal' | 'vertical') {
  return root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const dimensions = std.textureDimensions(processLayout.$.inputTexture);
    const texelSize = 1 / d.vec2f(dimensions);
    const uv = (d.vec2f(x, y) + 0.5) / d.vec2f(dimensions);

    const offsetDir = direction === 'horizontal' ? d.vec2f(1, 0) : d.vec2f(0, 1);

    let result = d.vec3f(0);
    let totalWeight = d.f32(0);

    for (let i = -BLUR_RADIUS; i <= BLUR_RADIUS; i++) {
      const offset = offsetDir * i * texelSize;
      const weight = std.exp(-d.f32(i * i) / (2 * BLUR_RADIUS));
      result +=
        std.textureSampleLevel(
          processLayout.$.inputTexture,
          processLayout.$.sampler,
          uv + offset,
          0,
        ).rgb * weight;
      totalWeight += weight;
    }

    std.textureStore(
      processLayout.$.outputTexture,
      d.vec2u(x, y),
      d.vec4f(result / totalWeight, 1),
    );
  });
}
