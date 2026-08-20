import { d, std, tgpu } from 'typegpu';
import { binaryLayout, channelAffineLayout, unaryLayout } from './layouts.ts';
import { maskPaddedChannels } from './helpers.ts';
import { DEPTH_KERNEL_WORKGROUP_SIZE, type ElementwiseShape } from './types.ts';

export const BinaryBroadcastCode = {
  None: 0,
  Scalar: 1,
  Channels: 2,
  Spatial: 3,
} as const;

export const channelAffineKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = channelAffineLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }
  const block = index % params.channelBlocks;
  const scaled =
    channelAffineLayout.$.src[index] * channelAffineLayout.$.scale[params.scaleBase + block];
  channelAffineLayout.$.dst[index] = maskPaddedChannels(
    scaled + channelAffineLayout.$.bias[params.biasBase + block],
    block,
    params.logicalChannels,
  );
});

export type BinaryCombine = (lhs: d.v4f, rhs: d.v4f) => d.v4f;

export const addCombine = (lhs: d.v4f, rhs: d.v4f) => {
  'use gpu';
  return lhs + rhs;
};

export const subtractCombine = (lhs: d.v4f, rhs: d.v4f) => {
  'use gpu';
  return lhs - rhs;
};

export const multiplyCombine = (lhs: d.v4f, rhs: d.v4f) => {
  'use gpu';
  return lhs * rhs;
};

export const createBinaryKernel = (
  shape: ElementwiseShape,
  combine: BinaryCombine,
  broadcast: number,
) => {
  const { elementCount, channelBlocks, logicalChannels } = shape;
  const guardElements = elementCount % DEPTH_KERNEL_WORKGROUP_SIZE !== 0;
  const maskChannels = logicalChannels !== channelBlocks * 4;

  return tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
  })(({ gid }) => {
    'use gpu';
    const index = gid.x;
    if (!guardElements || index < elementCount) {
      const rhsBase = binaryLayout.$.params.rhsBase;
      let rhs = d.vec4f(0);
      if (broadcast === BinaryBroadcastCode.Scalar) {
        rhs = d.vec4f(binaryLayout.$.rhs[rhsBase].x);
      } else if (broadcast === BinaryBroadcastCode.Channels) {
        rhs = d.vec4f(binaryLayout.$.rhs[rhsBase + (index % channelBlocks)]);
      } else if (broadcast === BinaryBroadcastCode.Spatial) {
        rhs = d.vec4f(binaryLayout.$.rhs[rhsBase + std.intdiv(index, channelBlocks)].x);
      } else {
        rhs = d.vec4f(binaryLayout.$.rhs[rhsBase + index]);
      }
      const value = combine(d.vec4f(binaryLayout.$.lhs[index]), rhs);
      if (maskChannels) {
        binaryLayout.$.dst[index] = maskPaddedChannels(
          value,
          index % channelBlocks,
          logicalChannels,
        );
      } else {
        binaryLayout.$.dst[index] = d.vec4f(value);
      }
    }
  });
};

export type UnaryActivation = (value: d.v4f) => d.v4f;

export const createUnaryKernel = (shape: ElementwiseShape, activation: UnaryActivation) => {
  const { elementCount, channelBlocks, logicalChannels } = shape;
  const guardElements = elementCount % DEPTH_KERNEL_WORKGROUP_SIZE !== 0;
  const maskChannels = logicalChannels !== channelBlocks * 4;

  return tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
  })(({ gid }) => {
    'use gpu';
    const index = gid.x;
    if (!guardElements || index < elementCount) {
      const value = activation(d.vec4f(unaryLayout.$.src[index]));
      if (maskChannels) {
        unaryLayout.$.dst[index] = maskPaddedChannels(
          value,
          index % channelBlocks,
          logicalChannels,
        );
      } else {
        unaryLayout.$.dst[index] = d.vec4f(value);
      }
    }
  });
};
