import {
    type StorageFlag,
    TgpuBindGroup,
    type TgpuBuffer,
    type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import { NNLayer } from '../gpuLayer';
import { PipelineCache } from '../../pipelineCache.ts';
import { shapeCompute } from './compute.ts';
import { ioLayout, shapeParamsLayout, workgroupSize } from '../../schemas.ts';
import { identity } from '../activations/activationFunctions.ts';

export class LShape implements NNLayer {
    public readonly inSize: number; // Ignored effectively, but needed for interface
    public readonly outSize: number;
    public readonly activation = 'identity';

    private readonly paramsBindGroup: TgpuBindGroup;

    constructor(
        private readonly root: TgpuRoot,
        private readonly pipelineCache: PipelineCache,
        inputSize: number, // Size of input tensor (elements) - not used for shape output content but for validation
        shape: number[], // The actual shape dimensions to output
    ) {
        this.inSize = inputSize;
        this.outSize = shape.length;

        const dimsBuffer = this.root.createBuffer(
            d.arrayOf(d.f32, shape.length),
            shape,
        ).$usage('storage');

        this.paramsBindGroup = this.root.createBindGroup(shapeParamsLayout, {
            dims: dimsBuffer,
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
            kind: 'Shape',
            compute: shapeCompute,
        }, { kind: 'identity', fn: identity });

        pipeline
            .with(ioBindGroup)
            .with(this.paramsBindGroup)
            .dispatchWorkgroups(Math.ceil(this.outSize / workgroupSize));

        await this.root.device.queue.onSubmittedWorkDone();
    }
}
