import {
    type StorageFlag,
    TgpuBindGroup,
    type TgpuBuffer,
    type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import { NNLayer } from '../gpuLayer';
import { PipelineCache } from '../../pipelineCache.ts';
import { clipCompute } from './compute.ts';
import { clipParamsLayout, ioLayout, workgroupSize } from '../../schemas.ts';
import { identity } from '../activations/activationFunctions.ts';

export class LClip implements NNLayer {
    public readonly inSize: number;
    public readonly outSize: number;
    public readonly activation = 'identity';

    private readonly paramsBindGroup: TgpuBindGroup;

    constructor(
        private readonly root: TgpuRoot,
        private readonly pipelineCache: PipelineCache,
        size: number,
        minVal: number,
        maxVal: number,
    ) {
        this.inSize = size;
        this.outSize = size;

        const boundsBuffer = this.root.createBuffer(
            d.arrayOf(d.f32, 2),
            [minVal, maxVal],
        ).$usage('storage');

        this.paramsBindGroup = this.root.createBindGroup(clipParamsLayout, {
            bounds: boundsBuffer,
        });
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

        const pipeline = this.pipelineCache.get({
            kind: 'Clip',
            compute: clipCompute,
        }, { kind: 'identity', fn: identity });

        pipeline
            .with(ioBindGroup)
            .with(this.paramsBindGroup)
            .dispatchWorkgroups(Math.ceil(this.outSize / workgroupSize));

        await this.root.device.queue.onSubmittedWorkDone();
    }
}
