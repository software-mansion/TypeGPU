import tgpu, { d, std } from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import { WORKGROUP_SIZE, type Vec4Buffer } from './kernels.ts';

const FIXED_INPUT_MASK = 255;
const FIXED_INPUT_SHIFT = 8;

export interface VideoFrameCrop {
  sourceWidth: number;
  sourceHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const videoFrameParams = d.struct({
  sourceSize: d.vec2u,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
});

const videoFrameShape = d.struct({
  inputSize: d.vec2u,
  total: d.u32,
});

export const videoFrameShapeAccess = tgpu.accessor(videoFrameShape, {
  inputSize: d.vec2u(1),
  total: 1,
});

const videoFrameLayout = tgpu.bindGroupLayout({
  params: { uniform: videoFrameParams },
  frame: { externalTexture: d.textureExternal() },
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
  const shape = videoFrameShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const coord = d.vec2u(i & FIXED_INPUT_MASK, std.bitShiftRight(i, FIXED_INPUT_SHIFT));
  const inputSize = d.vec2f(shape.inputSize);
  const pixel = d.vec2f(coord) + 0.5;
  const mirroredPixel = d.vec2f(inputSize.x - pixel.x, pixel.y);
  const cropUv = mirroredPixel / inputSize;
  const uv =
    (videoFrameLayout.$.params.cropOrigin + cropUv * videoFrameLayout.$.params.cropSize) /
    d.vec2f(videoFrameLayout.$.params.sourceSize);
  const color = std.textureSampleBaseClampToEdge(
    videoFrameLayout.$.frame,
    videoFrameLayout.$.sampler,
    uv,
  );
  videoFrameLayout.$.dst[i] = d.vec4f(color.rgb, 0);
});

export function createVideoPreprocessor(
  root: TgpuRoot,
  width: number,
  height: number,
): VideoPreprocessor {
  const total = width * height;
  const workgroups = Math.ceil(total / WORKGROUP_SIZE);

  const pipeline = root
    .with(videoFrameShapeAccess, {
      inputSize: d.vec2u(width, height),
      total,
    })
    .createComputePipeline({ compute: videoPreprocessKernel });
  const paramsBuffer = root
    .createBuffer(videoFrameParams, {
      sourceSize: d.vec2u(1, 1),
      cropOrigin: d.vec2f(0),
      cropSize: d.vec2f(1),
    })
    .$usage('uniform');
  const sampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  return {
    encode(pass, externalTexture, crop, dst) {
      paramsBuffer.write({
        sourceSize: d.vec2u(crop.sourceWidth, crop.sourceHeight),
        cropOrigin: d.vec2f(crop.x, crop.y),
        cropSize: d.vec2f(crop.width, crop.height),
      });
      pipeline
        .with(pass)
        .with(
          root.createBindGroup(videoFrameLayout, {
            params: paramsBuffer,
            frame: externalTexture,
            sampler,
            dst,
          }),
        )
        .dispatchWorkgroups(workgroups);
    },
  };
}
