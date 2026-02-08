import type {
  TgpuGuardedComputePipeline,
  TgpuRoot,
  TgpuTexture,
  TgpuTextureView,
  TgpuUniform,
} from 'typegpu';
import tgpu, { d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import { BLUR_RADIUS, TAA_BLEND } from './constants.ts';
import { BloomParams } from './types.ts';

const taaResolveLayout = tgpu.bindGroupLayout({
  currentTexture: { texture: d.texture2d(d.f32) },
  historyTexture: { texture: d.texture2d(d.f32) },
  outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
});

const copyLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d(d.f32) },
  outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
});

const extractBrightLayout = tgpu.bindGroupLayout({
  sourceTexture: { texture: d.texture2d(d.f32) },
  outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
  sampler: { sampler: 'filtering' },
  params: { uniform: BloomParams },
});

const blurLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d(d.f32) },
  outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
  sampler: { sampler: 'filtering' },
});

const compositeLayout = tgpu.bindGroupLayout({
  colorTexture: { texture: d.texture2d(d.f32) },
  bloomTexture: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' },
  params: { uniform: BloomParams },
});

export function createProcessingTexture(
  root: TgpuRoot,
  width: number,
  height: number,
) {
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

export interface ProcessingTexture {
  texture: TgpuTexture<{ size: [number, number]; format: 'rgba16float' }>;
  writeView: TgpuTextureView<d.WgslStorageTexture2d<'rgba16float'>>;
  sampleView: TgpuTextureView<d.WgslTexture2d<d.F32>>;
}

export interface PostProcessingPipelines {
  result: ProcessingTexture;
  runTaa: () => void;
  runBloom: () => void;
  render: (targetView: GPUTextureView) => void;
}

export function createPostProcessingPipelines(
  root: TgpuRoot,
  width: number,
  height: number,
  bloomUniform: TgpuUniform<typeof BloomParams>,
  presentationFormat: GPUTextureFormat,
): PostProcessingPipelines {
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

  const taaResolve = root['~unstable'].createGuardedComputePipeline((x, y) => {
    'use gpu';
    const coord = d.vec2i(d.i32(x), d.i32(y));
    const current = std.textureLoad(
      taaResolveLayout.$.currentTexture,
      coord,
      0,
    );
    const historyColor = std.textureLoad(
      taaResolveLayout.$.historyTexture,
      coord,
      0,
    );

    let minColor = d.vec3f(9999);
    let maxColor = d.vec3f(-9999);

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const sampleCoord = coord.add(d.vec2i(ox, oy));
        const clampedCoord = std.clamp(
          sampleCoord,
          d.vec2i(0, 0),
          d.vec2i(d.i32(width) - 1, d.i32(height) - 1),
        );
        const neighbor = std.textureLoad(
          taaResolveLayout.$.currentTexture,
          clampedCoord,
          0,
        ).xyz;
        minColor = std.min(minColor, neighbor);
        maxColor = std.max(maxColor, neighbor);
      }
    }

    const clampedHistory = std.clamp(historyColor.xyz, minColor, maxColor);
    const blended = std.mix(current.xyz, clampedHistory, TAA_BLEND);

    std.textureStore(
      taaResolveLayout.$.outputTexture,
      d.vec2u(x, y),
      d.vec4f(blended, 1),
    );
  });

  const copyToHistory = root['~unstable'].createGuardedComputePipeline(
    (x, y) => {
      'use gpu';
      const color = std.textureLoad(
        copyLayout.$.inputTexture,
        d.vec2i(d.i32(x), d.i32(y)),
        0,
      );
      std.textureStore(copyLayout.$.outputTexture, d.vec2u(x, y), color);
    },
  );

  const extractBright = root['~unstable'].createGuardedComputePipeline(
    (x, y) => {
      'use gpu';
      const dimensions = std.textureDimensions(
        extractBrightLayout.$.outputTexture,
      );
      const uv = d.vec2f(x, y).add(0.5).div(d.vec2f(dimensions));
      const color = std.textureSampleLevel(
        extractBrightLayout.$.sourceTexture,
        extractBrightLayout.$.sampler,
        uv,
        0,
      );
      const brightness = std.dot(color.xyz, d.vec3f(0.2126, 0.7152, 0.0722));
      const threshold = extractBrightLayout.$.params.threshold;
      const bright = std.max(brightness - threshold, 0) /
        std.max(brightness, 1e-4);
      const bloomColor = color.xyz.mul(bright);
      std.textureStore(
        extractBrightLayout.$.outputTexture,
        d.vec2u(x, y),
        d.vec4f(bloomColor, 1),
      );
    },
  );

  const blurHorizontal = createBlurPass(root, 'horizontal', blurLayout);

  const blurVertical = createBlurPass(root, 'vertical', blurLayout);

  const fragmentMain = tgpu['~unstable'].fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    const color = std.textureSample(
      compositeLayout.$.colorTexture,
      compositeLayout.$.sampler,
      uv,
    );
    const bloomColor = std.textureSample(
      compositeLayout.$.bloomTexture,
      compositeLayout.$.sampler,
      uv,
    );

    let final = color.xyz.add(
      bloomColor.xyz.mul(compositeLayout.$.params.intensity),
    );

    const centeredUV = uv.sub(0.5).mul(2);
    const vignette = 1 - std.dot(centeredUV, centeredUV) * 0.15;
    final = final.mul(vignette);

    return d.vec4f(final, 1);
  });

  const renderPipeline = root['~unstable']
    .withVertex(fullScreenTriangle, {})
    .withFragment(fragmentMain, { format: presentationFormat })
    .createPipeline();

  const taaBindGroup = root.createBindGroup(taaResolveLayout, {
    currentTexture: result.sampleView,
    historyTexture: history.sampleView,
    outputTexture: taaOutput.writeView,
  });

  const copyBindGroup = root.createBindGroup(copyLayout, {
    inputTexture: taaOutput.sampleView,
    outputTexture: history.writeView,
  });

  const extractBindGroup = root.createBindGroup(extractBrightLayout, {
    sourceTexture: result.sampleView,
    outputTexture: bloom.writeView,
    sampler,
    params: bloomUniform.buffer,
  });

  const blurHorizontalBindGroup = root.createBindGroup(blurLayout, {
    inputTexture: bloom.sampleView,
    outputTexture: blurTemp.writeView,
    sampler,
  });

  const blurVerticalBindGroup = root.createBindGroup(blurLayout, {
    inputTexture: blurTemp.sampleView,
    outputTexture: bloom.writeView,
    sampler,
  });

  const compositeBindGroup = root.createBindGroup(compositeLayout, {
    colorTexture: taaOutput.sampleView,
    bloomTexture: bloom.sampleView,
    sampler,
    params: bloomUniform.buffer,
  });

  return {
    result,
    runTaa: () => {
      taaResolve.with(taaBindGroup).dispatchThreads(width, height);
      copyToHistory.with(copyBindGroup).dispatchThreads(width, height);
    },
    runBloom: () => {
      extractBright
        .with(extractBindGroup)
        .dispatchThreads(bloomWidth, bloomHeight);
      blurHorizontal
        .with(blurHorizontalBindGroup)
        .dispatchThreads(bloomWidth, bloomHeight);
      blurVertical
        .with(blurVerticalBindGroup)
        .dispatchThreads(bloomWidth, bloomHeight);
    },
    render: (targetView: GPUTextureView) => {
      renderPipeline
        .with(compositeBindGroup)
        .withColorAttachment({
          view: targetView,
          loadOp: 'clear',
          storeOp: 'store',
        })
        .draw(3);
    },
  };
}

function createBlurPass(
  root: TgpuRoot,
  direction: 'horizontal' | 'vertical',
  blurLayout: ReturnType<typeof tgpu.bindGroupLayout>,
): TgpuGuardedComputePipeline {
  return root['~unstable'].createGuardedComputePipeline((x, y) => {
    'use gpu';
    const dimensions = std.textureDimensions(blurLayout.$.inputTexture);
    const texelSize = d.vec2f(1).div(d.vec2f(dimensions));
    const uv = d.vec2f(x, y).add(0.5).div(d.vec2f(dimensions));

    const offsetDir = direction === 'horizontal'
      ? d.vec2f(1, 0)
      : d.vec2f(0, 1);

    let result = d.vec3f(0);
    let totalWeight = d.f32(0);

    for (let i = -BLUR_RADIUS; i <= BLUR_RADIUS; i++) {
      const offset = offsetDir.mul(d.f32(i)).mul(texelSize);
      const weight = std.exp(-d.f32(i * i) / (2 * BLUR_RADIUS));
      result = result.add(
        std
          .textureSampleLevel(
            blurLayout.$.inputTexture,
            blurLayout.$.sampler,
            uv.add(offset),
            0,
          )
          .xyz.mul(weight),
      );
      totalWeight += weight;
    }

    std.textureStore(
      blurLayout.$.outputTexture,
      d.vec2u(x, y),
      d.vec4f(result.div(totalWeight), 1),
    );
  });
}
