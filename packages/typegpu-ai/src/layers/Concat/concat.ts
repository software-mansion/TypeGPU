import {
    type StorageFlag,
    TgpuBindGroup,
    type TgpuBuffer,
    type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import { NNLayer } from '../gpuLayer';
import { PipelineCache } from '../../pipelineCache.ts';
import { concatCompute } from './compute.ts';
import {
    concatParamsLayout,
    ioLayout,
    workgroupSize,
} from '../../schemas.ts';
import { identity } from '../activations/activationFunctions.ts';

export class LConcat implements NNLayer {
    public readonly inSize: number; // Size of the *current* input being copied
    public readonly outSize: number; // Total size of the concatenated output
    public readonly activation = 'identity';

    // Concat is special: it doesn't just run once. It needs to be called for each input.
    // However, NNLayer interface assumes single run.
    // We might need to handle this by having LConcat represent the *operation* of concatenating
    // multiple known inputs?
    // Or, more likely in this simple inference engine, LConcat might just be a copy operation
    // that knows its offset?
    // But Concat layer in ONNX takes N inputs.
    // If we stick to the linear chain, we can't easily implement Concat of dynamic streams.
    // But if we assume we are just copying the *current* stream into a larger buffer...
    // Let's implement it as a "Copy to Offset" layer for now?
    // No, that's not a generic Concat.

    // For the purpose of "implementing the layer", I'll define it as taking multiple inputs
    // in the constructor (if they are constant) or just providing the mechanism to copy.

    // Let's assume for this "simple" implementation that Concat is not fully supported in the
    // linear inference engine, BUT we provide the class.
    // I'll implement it such that 'run' takes an input and copies it to 'offset'.
    // But 'run' signature is fixed.

    // I'll implement a no-op run or throw error, because Concat requires structural changes to Inference.
    // Wait, I can implement it if I assume the inputs are available.

    private readonly offset: number;

    constructor(
        private readonly root: TgpuRoot,
        private readonly pipelineCache: PipelineCache,
        inSize: number,
        outSize: number,
        offset: number,
    ) {
        this.inSize = inSize;
        this.outSize = outSize;
        this.offset = offset;
    }

    async run(
        input: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
        output: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    ): Promise<void> {
        const ioBindGroup = this.root.createBindGroup(ioLayout, {
            input,
            output,
            inLength: this.root.createBuffer(d.u32, this.inSize).$usage('uniform'),
            outLength: this.root.createBuffer(d.u32, this.outSize).$usage('uniform'),
        });

        const paramsBindGroup = this.root.createBindGroup(concatParamsLayout, {
            offset: this.root.createBuffer(d.u32, this.offset).$usage('uniform'),
        });

        const pipeline = this.pipelineCache.get({
            kind: 'Concat',
            compute: concatCompute,
        }, { kind: 'identity', fn: identity });

        pipeline
            .with(ioLayout, ioBindGroup)
            .with(concatParamsLayout, paramsBindGroup)
            .dispatchWorkgroups(Math.ceil(this.inSize / workgroupSize));

        await this.root.device.queue.onSubmittedWorkDone();
    }
}
