import tgpu, { d, std } from 'typegpu';
import type { TgpuBindGroup, TgpuRoot } from 'typegpu';
import { frameCropParams, initialFrameCropParams, type VideoFrameCrop } from '../frame.ts';
import { WORKGROUP_SIZE, type Vec4Buffer } from './kernels/types.ts';

const MODEL_WIDTH = 256;
const MODEL_HEIGHT = 256;
const MODEL_PIXELS = MODEL_WIDTH * MODEL_HEIGHT;
const MODEL_COORD_MASK = MODEL_WIDTH - 1;
const MODEL_COORD_SHIFT = 8;

const MODEL_SIZE = d.vec2f(MODEL_WIDTH, MODEL_HEIGHT);

const videoFrameParamsLayout = tgpu.bindGroupLayout({
  params: { uniform: frameCropParams },
});

const videoFrameFrameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});

const videoFrameOutputLayout = tgpu.bindGroupLayout({
  sampler: { sampler: 'filtering' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export interface VideoPreprocessor {
  encode(
    pass: GPUComputePassEncoder,
    externalTexture: GPUExternalTexture,
    crop: VideoFrameCrop,
    dst: Vec4Buffer,
  ): void;
}

export const videoPreprocessKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= MODEL_PIXELS) {
    return;
  }

  const coord = d.vec2u(i & MODEL_COORD_MASK, std.bitShiftRight(i, MODEL_COORD_SHIFT));
  const pixel = d.vec2f(coord) + 0.5;
  const cropUv = d.vec2f(MODEL_SIZE.x - pixel.x, pixel.y) / MODEL_SIZE;
  const uv =
    (videoFrameParamsLayout.$.params.cropOrigin +
      cropUv * videoFrameParamsLayout.$.params.cropSize) /
    d.vec2f(videoFrameParamsLayout.$.params.sourceSize);

  const color = std.textureSampleBaseClampToEdge(
    videoFrameFrameLayout.$.frame,
    videoFrameOutputLayout.$.sampler,
    uv,
  );

  videoFrameOutputLayout.$.dst[i] = d.vec4f(color.rgb, 0);
});

export function createVideoPreprocessor(root: TgpuRoot): VideoPreprocessor {
  const workgroups = Math.ceil(MODEL_PIXELS / WORKGROUP_SIZE);
  const pipeline = root.createComputePipeline({ compute: videoPreprocessKernel });
  const paramsBuffer = root.createBuffer(frameCropParams, initialFrameCropParams).$usage('uniform');
  const sampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });
  const paramsBindGroup = root.createBindGroup(videoFrameParamsLayout, {
    params: paramsBuffer,
  });
  let outputBuffer: Vec4Buffer | undefined;
  let outputBindGroup: TgpuBindGroup<typeof videoFrameOutputLayout.entries> | undefined;

  const outputBindGroupFor = (dst: Vec4Buffer) => {
    if (outputBuffer === dst && outputBindGroup) {
      return outputBindGroup;
    }

    outputBuffer = dst;
    outputBindGroup = root.createBindGroup(videoFrameOutputLayout, {
      sampler,
      dst,
    });
    return outputBindGroup;
  };

  return {
    encode(pass, externalTexture, crop, dst) {
      paramsBuffer.write(crop);
      pipeline
        .with(pass)
        .with(paramsBindGroup)
        .with(root.createBindGroup(videoFrameFrameLayout, { frame: externalTexture }))
        .with(outputBindGroupFor(dst))
        .dispatchWorkgroups(workgroups);
    },
  };
}
