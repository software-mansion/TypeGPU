import {
  d,
  tgpu,
  type TgpuBindGroup,
  type TgpuCommandEncoder,
  type TgpuComputePass,
  type WithBinding,
} from 'typegpu';

export interface UpdateOptions {
  bindGroups?: readonly TgpuBindGroup[];
  encoder?: TgpuCommandEncoder | GPUCommandEncoder;
  pass?: TgpuComputePass | GPUComputePassEncoder;
}

export function createFill(
  root: WithBinding,
  count: number,
  write: (index: number) => void,
  bindGroups: readonly TgpuBindGroup[] = [],
) {
  const x = Math.min(Math.ceil(count / 64), 65535);
  const y = x === 0 ? 0 : Math.ceil(count / (x * 64));

  const compute = tgpu.computeFn({
    workgroupSize: [64],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const i = gid.x + gid.y * (x * 64);

    if (i < count) {
      write(i);
    }
  });

  let pipeline = root.createComputePipeline({ compute });
  for (const group of bindGroups) {
    pipeline = pipeline.with(group);
  }

  return {
    initAsync: async () => {
      if (count > 0) await pipeline.initAsync();
    },
    run: (options: UpdateOptions = {}) => {
      if (options.encoder && options.pass) {
        throw new Error('Supply either an encoder or a compute pass, not both');
      }
      if (count === 0) return;

      let target = pipeline;
      for (const group of options.bindGroups ?? []) {
        target = target.with(group);
      }

      if (options.pass) {
        target = target.with(options.pass as TgpuComputePass);
      } else if (options.encoder) {
        target = target.with(options.encoder as TgpuCommandEncoder);
      }

      target.dispatchWorkgroups(x, y);
    },
  };
}
