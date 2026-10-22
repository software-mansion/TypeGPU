import {
  d,
  tgpu,
  type TgpuBindGroup,
  type TgpuCommandEncoder,
  type TgpuComputePass,
  type TgpuRoot,
  type WithBinding,
} from 'typegpu';

interface EncoderOptions {
  /** Records the work as one compute pass on this encoder. Nothing is submitted */
  encoder: GPUCommandEncoder | TgpuCommandEncoder;
  pass?: never;
}

interface PassOptions {
  encoder?: never;
  /** Records the work into this pass. Nothing is submitted and the pass is not ended */
  pass: GPUComputePassEncoder | TgpuComputePass;
}

interface SubmitOptions {
  encoder?: never;
  pass?: never;
}

/** Controls where the work is recorded. Defaults to a standalone submit */
export type RecordOptions = EncoderOptions | PassOptions | SubmitOptions;

export type UpdateOptions = RecordOptions & {
  /** Bind groups for this call, applied over the ones given when baking */
  bindGroups?: readonly TgpuBindGroup[];
};

export interface Fill {
  initAsync(): Promise<void>;
  record(pass: TgpuComputePass, bindGroups?: readonly TgpuBindGroup[]): void;
}

export function createFill(
  root: WithBinding,
  count: number,
  write: (index: number) => void,
  bindGroups: readonly TgpuBindGroup[] = [],
): Fill {
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
    record: (pass, groups = []) => {
      if (count === 0) return;

      let target = pipeline;
      for (const group of groups) {
        target = target.with(group);
      }
      target.with(pass).dispatchWorkgroups(x, y);
    },
  };
}

export function recordFills(root: TgpuRoot, fills: readonly Fill[], options: UpdateOptions) {
  const record = (pass: TgpuComputePass) => {
    for (const fill of fills) fill.record(pass, options.bindGroups);
  };

  if (options.pass) {
    record(options.pass as TgpuComputePass);
    return;
  }

  const encoder = options.encoder ?? root['~unstable'].createCommandEncoder();
  const pass = encoder.beginComputePass() as TgpuComputePass;
  record(pass);
  pass.end();
  if (!options.encoder) (encoder as TgpuCommandEncoder).submit();
}
