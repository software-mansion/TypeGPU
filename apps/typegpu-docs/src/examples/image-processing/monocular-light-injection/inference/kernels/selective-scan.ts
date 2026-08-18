import { d, std, tgpu } from 'typegpu';
import { crossScanSourcePixel, directionalScalarIndex } from './cross-scan.ts';
import { componentAt, softplus } from './helpers.ts';
import { selectiveScanLayout } from './layouts.ts';
import { DEPTH_KERNEL_WORKGROUP_SIZE, SELECTIVE_SCAN_STATE_SIZE } from './types.ts';

/**
 * Correctness-first DepthART recurrence. One invocation owns a complete
 * `(direction, channel)` sequence and keeps all eight states in private FP32 memory.
 */
export const sequentialSelectiveScanKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const sequence = gid.x;
  const params = selectiveScanLayout.$.params;
  if (sequence >= params.sequenceCount) {
    return;
  }

  const channel = sequence % params.logicalChannels;
  const direction = std.intdiv(sequence, params.logicalChannels);
  const state = d.arrayOf(d.f32, SELECTIVE_SCAN_STATE_SIZE)();
  const channelParameterIndex = direction * params.logicalChannels + channel;

  for (let position = d.u32(0); position < params.positionCount; position += 1) {
    const pixel = crossScanSourcePixel(direction, position, params.width, params.height);
    const srcIndex = pixel * params.channelBlocks + std.intdiv(channel, 4);
    const u = componentAt(selectiveScanLayout.$.src[srcIndex], channel % 4);
    const sequenceValueIndex = directionalScalarIndex(
      direction,
      channel,
      position,
      params.logicalChannels,
      params.positionCount,
    );
    const delta = softplus(
      selectiveScanLayout.$.delta[sequenceValueIndex] +
        selectiveScanLayout.$.deltaBias[params.deltaBiasBase + channelParameterIndex],
    );
    let output = d.f32(0);

    for (const stateIndex of tgpu.unroll([0, 1, 2, 3, 4, 5, 6, 7])) {
      const a = std.exp(
        delta *
          selectiveScanLayout.$.a[
            params.aBase + channelParameterIndex * SELECTIVE_SCAN_STATE_SIZE + stateIndex
          ],
      );
      const bcIndex =
        (direction * SELECTIVE_SCAN_STATE_SIZE + stateIndex) * params.positionCount + position;
      const nextState = std.fma(a, state[stateIndex], delta * selectiveScanLayout.$.b[bcIndex] * u);
      state[stateIndex] = nextState;
      output = std.fma(selectiveScanLayout.$.c[bcIndex], nextState, output);
    }

    selectiveScanLayout.$.directionalDst[sequenceValueIndex] = std.fma(
      selectiveScanLayout.$.d[params.dBase + channelParameterIndex],
      u,
      output,
    );
  }
});
